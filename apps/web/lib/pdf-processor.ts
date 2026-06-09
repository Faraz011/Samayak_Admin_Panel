// Force Next.js Node File Trace (NFT) to bundle @napi-rs/canvas on Vercel.
// Without this, the dynamic process.getBuiltinModule require inside pdfjs-dist is hidden
// from static analysis, causing the native package to be omitted from Vercel's zip.
if (process.env.NODE_ENV === 'production') {
  // @ts-ignore
  import('@napi-rs/canvas').catch(() => {});
  // @ts-ignore
  import('@napi-rs/canvas-linux-x64-gnu').catch(() => {});
}

// ============================================================
// Polyfills for pdfjs-dist in Node.js serverless/Vercel environment
// These MUST be set before any pdfjs-dist import happens.
// ============================================================

// Polyfill DOMMatrix
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true; isIdentity = true;
    constructor(matrix?: any) {
      if (Array.isArray(matrix)) {
        this.a = this.m11 = matrix[0] ?? 1;
        this.b = this.m12 = matrix[1] ?? 0;
        this.c = this.m21 = matrix[2] ?? 0;
        this.d = this.m22 = matrix[3] ?? 1;
        this.e = this.m41 = matrix[4] ?? 0;
        this.f = this.m42 = matrix[5] ?? 0;
      }
    }
    translate() { return new (globalThis as any).DOMMatrix(); }
    scale() { return new (globalThis as any).DOMMatrix(); }
    multiply() { return new (globalThis as any).DOMMatrix(); }
    inverse() { return new (globalThis as any).DOMMatrix(); }
    transformPoint(p: any) { return { x: p?.x ?? 0, y: p?.y ?? 0, z: 0, w: 1 }; }
  };
}

// Polyfill Path2D (required by pdfjs canvas renderer)
if (typeof (globalThis as any).Path2D === 'undefined') {
  (globalThis as any).Path2D = class Path2D {
    constructor(_path?: any) {}
    addPath() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    arc() {}
    arcTo() {}
    closePath() {}
    rect() {}
    ellipse() {}
  };
}

// ============================================================
// Pre-load pdfjs worker onto globalThis to prevent Vercel errors.
//
// pdfjs-dist v6 checks `globalThis.pdfjsWorker?.WorkerMessageHandler`
// before attempting to dynamically import `./pdf.worker.mjs`.
// In Vercel serverless, that dynamic import fails because the
// bundler doesn't trace the worker file. By pre-loading it here,
// we bypass the dynamic import entirely.
// ============================================================
async function preloadPdfjsWorker(): Promise<void> {
  if ((globalThis as any).pdfjsWorker) return; // already loaded
  try {
    const workerModule = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    (globalThis as any).pdfjsWorker = workerModule;
    console.log('✅ Pre-loaded pdfjs worker onto globalThis.pdfjsWorker');
  } catch (err: any) {
    console.warn('⚠️ Failed to pre-load pdfjs worker:', err.message);
    // Fallback: if the worker can't be imported, pdf-to-png-converter
    // will fail gracefully and we'll return an informative error.
  }
}

// Fire-and-forget the preload (it's cached after first call)
const _pdfjsWorkerReady = preloadPdfjsWorker();

// @ts-ignore
import pdfParse from 'pdf-parse';

export interface ParsedTimetableRow {
  day: string;
  period: number;
  courseCode: string;
  facultyName: string;
  roomNumber: string;
  section: string;
  duration: number; // in periods (labs can span 2 or 3)
}

export interface ParseResult {
  rows: ParsedTimetableRow[];
  errors: Array<{ line: number; message: string }>;
  method: 'groq-llm' | 'regex-fallback';
  rawText?: string; // for debug logging
}

async function extractTextWithPdfJs(buffer: Buffer): Promise<string> {
  await _pdfjsWorkerReady;
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  
  const doc = await loadingTask.promise;
  let fullText = '';
  
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += `\n--- Page ${i} ---\n` + pageText;
    page.cleanup();
  }
  
  await doc.destroy();
  return fullText;
}

/**
 * Parse a BIT Mesra format timetable PDF using Groq LLM or regex fallback.
 * Supports both text-based PDFs and scanned (image-based) PDFs via Tesseract.js OCR.
 * Designed to run in a serverless Next.js API route.
 */
export async function parseTimetablePdf(base64Content: string): Promise<ParseResult> {
  const buffer = Buffer.from(base64Content, 'base64');

  // --- Step 1: Extract text ---
  let parsedText = '';
  let ocrUsed = false;
  const errors: Array<{ line: number; message: string }> = [];

  // Try extracting text via pdfjs-dist's native text layer first (more reliable than pdf-parse)
  try {
    console.log('Attempting text extraction with pdfjs-dist...');
    parsedText = await extractTextWithPdfJs(buffer);
    console.log(`pdfjs-dist extracted ${parsedText.trim().length} characters`);
  } catch (pdfjsErr: any) {
    console.warn('⚠️ pdfjs-dist text extraction failed:', pdfjsErr.message);
    errors.push({ line: 0, message: `pdfjs-dist text extraction failed: ${pdfjsErr.message}` });
  }

  // Fallback to pdf-parse if pdfjs-dist failed or returned insufficient text
  if (!parsedText || parsedText.trim().length < 50) {
    try {
      console.log('Attempting fallback text extraction with pdf-parse...');
      const result = await pdfParse(buffer);
      parsedText = result.text || '';
      console.log(`pdf-parse extracted ${parsedText.trim().length} characters`);
    } catch (pdfErr: any) {
      console.warn('⚠️ pdf-parse failed:', pdfErr.message);
      errors.push({ line: 0, message: `pdf-parse failed: ${pdfErr.message}` });
    }
  }

  // Fallback to OCR if both failed or returned insufficient text
  if (!parsedText || parsedText.trim().length < 50) {
    console.log('ℹ️ PDF contains insufficient readable text. Attempting Tesseract.js OCR...');
    try {
      parsedText = await runTesseractOCR(buffer);
      if (parsedText.trim().length > 50) {
        ocrUsed = true;
        console.log(`✅ Tesseract.js OCR extracted ${parsedText.length} characters`);
      }
    } catch (ocrErr: any) {
      console.error('⚠️ Tesseract.js OCR failed:', ocrErr.message);
      errors.push({ line: 0, message: `Tesseract.js OCR failed: ${ocrErr.message}` });
      if (ocrErr.stack) {
        errors.push({ line: 0, message: `OCR Stack: ${ocrErr.stack.substring(0, 500)}` });
      }
    }
  }

  if (!parsedText || parsedText.trim().length < 30) {
    return {
      rows: [],
      errors: [
        ...errors,
        { line: 0, message: 'PDF contains no readable text. Both pdf-parse and Tesseract OCR failed to extract content.' }
      ],
      method: 'regex-fallback',
      rawText: parsedText || '(empty)',
    };
  }

  const rawTextPreview = parsedText.substring(0, 2000);

  // --- Step 2: LLM Parsing ---
  const apiKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;
  if (apiKey) {
    try {
      const llmResult = await parseWithGroqTwoPass(parsedText, apiKey);
      if (llmResult.rows.length > 0) {
        return { ...llmResult, rawText: rawTextPreview };
      }
      console.warn('⚠️ Groq returned 0 rows, falling back to regex parser');
    } catch (err: any) {
      console.warn('⚠️ Groq LLM parsing failed, falling back to regex:', err.message);
    }
  } else {
    console.log('ℹ️ GROQ_API_KEY not set. Using regex parser.');
  }

  // --- Step 3: Regex fallback ---
  const regexResult = parseWithRegex(parsedText);
  return { ...regexResult, method: 'regex-fallback', rawText: rawTextPreview };
}

/**
 * Run Tesseract.js OCR on a PDF buffer.
 * Converts PDF pages to images and runs OCR on each.
 */
async function runTesseractOCR(pdfBuffer: Buffer): Promise<string> {
  console.log('Converting PDF pages to PNG images for OCR...');
  try {
    // Ensure pdfjs worker is pre-loaded before pdf-to-png-converter uses it
    await _pdfjsWorkerReady;

    const { pdfToPng } = await import('pdf-to-png-converter');
    const pngPages = await pdfToPng(pdfBuffer, { viewportScale: 2.0 });
    console.log(`Successfully converted PDF to ${pngPages.length} PNG pages.`);

    const TesseractModule = await import('tesseract.js');
    const Tesseract = (TesseractModule as any).default || TesseractModule;

    let fullText = '';
    for (let i = 0; i < pngPages.length; i++) {
      console.log(`Running OCR on page ${i + 1}/${pngPages.length}...`);
      const { data } = await Tesseract.recognize(pngPages[i].content, 'eng');
      fullText += `\n--- Page ${i + 1} ---\n${data.text || ''}`;
    }

    return fullText;
  } catch (err: any) {
    console.error('⚠️ Tesseract OCR with PDF conversion failed:', err.message);
    throw err;
  }
}

/**
 * Two-pass Groq LLM extraction strategy for maximum accuracy.
 *
 * Pass 1: Extract raw grid content exactly as written (abbreviations, short names, rooms).
 * Pass 2: Resolve abbreviations to course codes using the mapping table from the PDF.
 *
 * This separation dramatically improves accuracy since each LLM call has a focused task.
 */
async function parseWithGroqTwoPass(text: string, apiKey: string): Promise<ParseResult> {
  console.log('🤖 Starting two-pass Groq LLM extraction...');

  // Chunk very long text to stay within token limits
  const maxChars = 14000;
  const textChunks: string[] = [];
  if (text.length <= maxChars) {
    textChunks.push(text);
  } else {
    const pages = text.split(/\f|\n{3,}/);
    let current = '';
    for (const page of pages) {
      if ((current + page).length > maxChars && current.length > 0) {
        textChunks.push(current);
        current = page;
      } else {
        current += '\n' + page;
      }
    }
    if (current.trim()) textChunks.push(current);
  }

  const allRows: ParsedTimetableRow[] = [];
  const allErrors: Array<{ line: number; message: string }> = [];

  for (let chunkIdx = 0; chunkIdx < textChunks.length; chunkIdx++) {
    const chunk = textChunks[chunkIdx];

    // ===== SINGLE COMPREHENSIVE PASS =====
    // Instead of two separate API calls, we use a single highly detailed prompt
    // that instructs the LLM to do both extraction and resolution in one shot.
    const response = await callGroqAPI(apiKey, [
      {
        role: 'system',
        content: TIMETABLE_EXTRACTION_PROMPT,
      },
      {
        role: 'user',
        content: `Parse this timetable text completely. Extract EVERY class/lab slot.\n\n${chunk}`,
      },
    ]);

    if (response) {
      try {
        const parsed = JSON.parse(response);
        if (parsed && Array.isArray(parsed.rows)) {
          for (const row of parsed.rows) {
            if (isValidRow(row)) {
              allRows.push({
                day: capitalizeDay(row.day),
                period: Number(row.period),
                courseCode: String(row.courseCode || row.course_code || '').trim(),
                facultyName: String(row.facultyName || row.faculty_name || row.faculty || '').trim(),
                roomNumber: String(row.roomNumber || row.room_number || row.room || '').trim(),
                section: String(row.section || '').trim(),
                duration: normalizeDuration(row.duration),
              });
            } else {
              allErrors.push({
                line: chunkIdx * 100 + allRows.length,
                message: `Invalid row from LLM: ${JSON.stringify(row)}`,
              });
            }
          }
        }
      } catch (parseErr: any) {
        allErrors.push({
          line: chunkIdx * 100,
          message: `Failed to parse Groq JSON response for chunk ${chunkIdx + 1}: ${parseErr.message}`,
        });
      }
    }

    // Rate limit between chunks
    if (chunkIdx < textChunks.length - 1) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  // ===== PASS 2: COURSE CODE RESOLUTION =====
  // If any rows have abbreviations instead of course codes, try to resolve them
  // using the mapping table that should be in the text
  const unresolvedRows = allRows.filter(
    (r) => r.courseCode && !r.courseCode.match(/^[A-Z]{2,4}\d{3,5}[A-Z]?$/i)
  );

  if (unresolvedRows.length > 0) {
    console.log(`🔄 Pass 2: Resolving ${unresolvedRows.length} abbreviations to course codes...`);
    try {
      const resolutionMap = await resolveCourseAbbreviations(text, unresolvedRows, apiKey);
      if (resolutionMap) {
        for (const row of allRows) {
          const key = row.courseCode.toUpperCase().trim();
          if (resolutionMap[key]) {
            const resolved = resolutionMap[key];
            if (resolved.courseCode) row.courseCode = resolved.courseCode;
            if (resolved.facultyName && !row.facultyName) row.facultyName = resolved.facultyName;
          }
        }
      }
    } catch (resolveErr: any) {
      allErrors.push({
        line: -1,
        message: `[WARNING] Pass 2 course code resolution failed: ${resolveErr.message}. Abbreviations may remain unresolved.`,
      });
    }
  }

  console.log(`✅ Groq LLM parsed ${allRows.length} rows across ${textChunks.length} chunk(s)`);
  return { rows: allRows, errors: allErrors, method: 'groq-llm' };
}

/**
 * Pass 2: Resolve course abbreviations to actual course codes using the
 * mapping table from the bottom of the PDF.
 */
async function resolveCourseAbbreviations(
  fullText: string,
  unresolvedRows: ParsedTimetableRow[],
  apiKey: string
): Promise<Record<string, { courseCode: string; facultyName: string }> | null> {
  const uniqueAbbrevs = [...new Set(unresolvedRows.map((r) => r.courseCode.trim()))];

  const response = await callGroqAPI(apiKey, [
    {
      role: 'system',
      content: `You are resolving course abbreviations from a BIT Mesra timetable.

The timetable text contains a mapping table (usually at the bottom) that maps course abbreviations/short names to their actual course codes and teacher/faculty names.

For example:
- "CD" → Course Code: "CS333", Faculty: "Dr. B. K. Sarkar"
- "AIML" → Course Code: "CS335", Faculty: "Dr. Shruti Garg"
- "CNS" → Course Code: "IT349", Faculty: "Dr. XYZ"

I need you to find and return the resolution for each abbreviation.

Output ONLY a valid JSON object mapping each abbreviation to its resolved code and faculty:
{
  "CD": { "courseCode": "CS333", "facultyName": "Dr. B. K. Sarkar" },
  "AIML": { "courseCode": "CS335", "facultyName": "Dr. Shruti Garg" }
}

If you cannot find the mapping for an abbreviation, omit it from the output.
Output ONLY valid JSON. No markdown, no explanations.`,
    },
    {
      role: 'user',
      content: `Resolve these abbreviations: ${JSON.stringify(uniqueAbbrevs)}\n\nFull timetable text:\n${fullText.substring(0, 10000)}`,
    },
  ]);

  if (response) {
    const parsed = JSON.parse(response);
    // Normalize keys to uppercase
    const normalized: Record<string, { courseCode: string; facultyName: string }> = {};
    for (const [key, value] of Object.entries(parsed)) {
      normalized[key.toUpperCase().trim()] = value as { courseCode: string; facultyName: string };
    }
    return normalized;
  }
  return null;
}

/**
 * Call the Groq API with given messages.
 */
async function callGroqAPI(
  apiKey: string,
  messages: Array<{ role: string; content: string }>
): Promise<string | null> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.0,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API returned status ${response.status}: ${errorText}`);
  }

  const resBody = await response.json();
  return resBody.choices?.[0]?.message?.content || null;
}

// ============================================================
// Enhanced LLM Prompt
// ============================================================

const TIMETABLE_EXTRACTION_PROMPT = `You are an expert academic scheduling parser for BIT Mesra (Birla Institute of Technology, Mesra) timetable documents.

TASK: Parse the provided timetable text and extract ALL class/lab schedule entries with maximum accuracy.

UNDERSTANDING THE TIMETABLE FORMAT:
1. The timetable has TWO parts:
   a. A GRID TABLE with days (Monday-Saturday) as rows and periods (I-IX) as columns.
      - Each cell contains a course abbreviation/short name (like "CD", "AIML", "CNS") and sometimes a room number (like "219", "Lab 4").
      - Some cells span multiple periods (labs usually span 2-3 consecutive periods).
   b. A COURSE MAPPING TABLE (usually at the bottom) listing:
      - Course codes (e.g., CS333, CS335, IT349, MA24202)
      - Course names (e.g., Compiler Design, Machine Learning)
      - Credits
      - Faculty/Teacher names (e.g., Dr. B. K. Sarkar, Dr. Shruti Garg)

2. HEADER INFORMATION: Look for semester and section info like:
   - "Semester: VI C" or "Semester: VIC" → Semester 6, Section C
   - "CSE VI A" → Branch CSE, Semester 6, Section A
   - "B.Tech CSE 4th Sem Section B" → Branch CSE, Semester 4, Section B

CRITICAL RESOLUTION STEP:
- You MUST cross-reference the grid abbreviations with the mapping table at the bottom.
- Map each abbreviation to its actual course code. For example:
  - "CD" in the grid → find "Compiler Design (CD)" in the mapping → course code is "CS333"
  - "AIML" in the grid → find "AI & Machine Learning" in the mapping → course code is "CS335"
- Similarly resolve the faculty name for each course from the mapping table.
- If you CANNOT find the mapping for an abbreviation, use the abbreviation as-is for courseCode.

OUTPUT FORMAT: Return ONLY a valid JSON object:
{
  "rows": [
    {
      "day": "Monday",
      "period": 1,
      "courseCode": "CS333",
      "facultyName": "Dr. B. K. Sarkar",
      "roomNumber": "219",
      "section": "C",
      "duration": 1
    }
  ]
}

RULES:
1. Days: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday (full English names)
2. Period: 1-9 (Roman numerals in header: I=1, II=2, III=3, IV=4, V=5, VI=6, VII=7, VIII=8, IX=9)
3. courseCode: Use the RESOLVED course code (e.g., "CS333") NOT the abbreviation (e.g., "CD"). If resolution is impossible, use the abbreviation.
4. facultyName: The full teacher/faculty name from the mapping. Leave empty string "" if unknown.
5. roomNumber: The room number or lab name. Leave empty string "" if not shown in cell.
6. section: The exact section letter (A, B, C, D). Extract from header context.
7. duration: 
   - Normal lectures = 1
   - Double period = 2
   - Lab sessions (usually span 3 consecutive periods) = 3
   - If a subject appears in 3 consecutive periods on the same day, it's ONE entry with duration=3, starting at the first period.
8. Parse EVERY visible slot — do not skip any entries.
9. Skip empty cells, breaks, lunch slots, and "OE" (Open Elective placeholder) entries unless they have a valid course code.
10. If the same subject appears in consecutive periods with the same room, merge into ONE entry with appropriate duration.

IMPORTANT: Output ONLY valid JSON. No markdown, no explanations, no code fences.`;

// ============================================================
// Validation & Helpers
// ============================================================

function isValidRow(row: any): boolean {
  if (!row || typeof row !== 'object') return false;

  // Must have day and courseCode at minimum
  if (!row.day) return false;

  const courseCode = row.courseCode || row.course_code || '';
  if (!courseCode || String(courseCode).trim().length === 0) return false;

  const period = Number(row.period);
  if (isNaN(period) || period < 1 || period > 9) return false;

  // roomNumber and facultyName are OPTIONAL — don't reject rows without them
  return true;
}

function normalizeDuration(dur: any): number {
  const d = Number(dur);
  if (d === 2) return 2;
  if (d === 3) return 3;
  return 1;
}

function capitalizeDay(day: string): string {
  const dayMap: Record<string, string> = {
    monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
    thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
  };
  return dayMap[day.toLowerCase()] || day;
}

/**
 * Regex-based fallback parser for when Groq is unavailable.
 */
function parseWithRegex(text: string): { rows: ParsedTimetableRow[]; errors: Array<{ line: number; message: string }> } {
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

    // Detect section headers
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
    const cellMatch = line.match(/([A-Z]{2,4}\d{3}[A-Z]?)\s*[\/\n\s]+\s*([^\/\n]+?)\s*[\/\n\s]+\s*([A-Za-z0-9-]+)/);
    if (cellMatch && currentDay) {
      const courseCode = cellMatch[1].trim();
      const facultyName = cellMatch[2].trim();
      const roomNumber = cellMatch[3].trim();

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

  // Detect multi-period labs
  for (let i = 0; i < rows.length - 1; i++) {
    if (
      rows[i].courseCode === rows[i + 1]?.courseCode &&
      rows[i].roomNumber === rows[i + 1]?.roomNumber &&
      rows[i].day === rows[i + 1]?.day &&
      rows[i + 1].period === rows[i].period + 1
    ) {
      rows[i].duration++;
      rows.splice(i + 1, 1);
      // Don't increment i — check for triple-period labs
      i--;
    }
  }

  return { rows, errors };
}

function estimatePeriod(lineIndex: number, lines: string[]): number {
  for (let j = lineIndex; j >= Math.max(0, lineIndex - 5); j--) {
    const match = lines[j].match(/P(\d)/i) || lines[j].match(/period\s*(\d)/i);
    if (match) return parseInt(match[1]);
  }
  return 1;
}
