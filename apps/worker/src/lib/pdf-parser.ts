import pdfParse from 'pdf-parse';

export interface ParsedTimetableRow {
  day: string;
  period: number;
  courseCode: string;
  facultyName: string;
  roomNumber: string;
  section: string;
  duration: number; // in periods (labs can span 2)
}

/**
 * Parse a BIT Mesra format timetable PDF.
 *
 * It checks if process.env.GROQ_API_KEY is defined and attempts LLM-based extraction.
 * If not defined or if the extraction fails, it falls back to a regex-based parser.
 */
export async function parseTimetablePdf(buffer: Buffer): Promise<{
  rows: ParsedTimetableRow[];
  errors: Array<{ line: number; message: string }>;
}> {
  const result = await pdfParse(buffer);
  const text = result.text;

  const apiKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;
  if (apiKey) {
    console.log('🤖 Utilizing Groq LLM API for structured timetable parsing...');
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          messages: [
            {
              role: 'system',
              content: `You are an expert academic scheduling parser. Parse the provided BIT Mesra timetable text and extract schedule entries. Output only a JSON object containing a 'rows' array matching this structure:
{
  "rows": [
    {
      "day": "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday",
      "period": 1..9,
      "courseCode": string (e.g. CS301),
      "facultyName": string (e.g. Dr. Rakesh Sharma),
      "roomNumber": string (e.g. 219 or Lab-2),
      "section": string (e.g. VI-A),
      "duration": 1 | 2
    }
  ]
}
Please extract every single class/lab slot found in the text. Make sure to identify sections, days of the week, period numbers (1 to 9), course codes, faculty names, and room numbers accurately. Set duration to 2 for slots that look like double-period labs. Ensure output is strictly valid JSON.`
            },
            {
              role: 'user',
              content: text
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`Groq API returned status ${response.status}: ${await response.text()}`);
      }

      const resBody = await response.json();
      const jsonText = resBody.choices?.[0]?.message?.content;
      if (jsonText) {
        const parsed = JSON.parse(jsonText);
        if (parsed && Array.isArray(parsed.rows)) {
          console.log(`✓ Successfully parsed ${parsed.rows.length} rows using Groq.`);
          return { rows: parsed.rows, errors: [] };
        }
      }
    } catch (err: any) {
      console.warn('⚠️ Groq parser failed, falling back to regex parser:', err.message);
    }
  } else {
    console.log('ℹ️ Groq API key not found. Using local regex parser...');
  }

  // Regex Fallback
  const rows: ParsedTimetableRow[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const dayMap: Record<string, string> = {
    mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
    thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
    monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
    thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday',
  };

  let currentSection = '';
  let currentDay = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect section headers (e.g., "Section: VI-A", "CSE VI A")
    const sectionMatch = line.match(/section[:\s]*([A-Z0-9\s-]+)/i) ||
      line.match(/^([A-Z]+)\s+(VI|IV|VIII|II|X)\s+([A-D])$/i);
    if (sectionMatch) {
      currentSection = sectionMatch[0].replace(/section[:\s]*/i, '').trim();
      continue;
    }

    // Detect day
    const dayWord = line.toLowerCase().split(/\s+/)[0];
    if (dayMap[dayWord]) {
      currentDay = dayMap[dayWord];
    }

    // Try to parse timetable cells
    // Format: "CS301 / Dr. Sharma / Room 219" or "CS301\nDr. Sharma\n219"
    const cellMatch = line.match(/([A-Z]{2,4}\d{3}[A-Z]?)\s*[\/\n\s]+\s*([^\/\n]+?)\s*[\/\n\s]+\s*([A-Za-z0-9-]+)/);
    if (cellMatch && currentDay) {
      const courseCode = cellMatch[1].trim();
      const facultyName = cellMatch[2].trim();
      const roomNumber = cellMatch[3].trim();

      // Determine period from context (position in line or explicit P1, P2, etc.)
      const periodMatch = line.match(/P(\d)/i) || line.match(/period\s*(\d)/i);
      const period = periodMatch ? parseInt(periodMatch[1]) : estimatePeriod(i, lines);

      if (period > 0 && period <= 9) {
        rows.push({
          day: currentDay,
          period,
          courseCode,
          facultyName,
          roomNumber,
          section: currentSection,
          duration: 1,
        });
      } else {
        errors.push({ line: i + 1, message: `Could not determine period for: ${line}` });
      }
    }
  }

  // Detect multi-period labs (consecutive same course+room entries)
  for (let i = 0; i < rows.length - 1; i++) {
    if (
      rows[i].courseCode === rows[i + 1]?.courseCode &&
      rows[i].roomNumber === rows[i + 1]?.roomNumber &&
      rows[i].day === rows[i + 1]?.day &&
      rows[i + 1].period === rows[i].period + 1
    ) {
      rows[i].duration = 2;
      rows.splice(i + 1, 1);
    }
  }

  return { rows, errors };
}

function estimatePeriod(lineIndex: number, lines: string[]): number {
  // Look backwards for period indicators
  for (let j = lineIndex; j >= Math.max(0, lineIndex - 5); j--) {
    const match = lines[j].match(/P(\d)/i) || lines[j].match(/period\s*(\d)/i);
    if (match) return parseInt(match[1]);
  }

  // Fallback: count cells in this day block
  return 1;
}
