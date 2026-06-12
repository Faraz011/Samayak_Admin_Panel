// ============================================================
// @napi-rs/canvas is a direct dependency used by pdf-to-png-converter
// and pdfjs-dist v6 for rendering PDF pages to images (OCR pipeline).
// It must NOT be mocked — the real module exports createCanvas().
// ============================================================

// ============================================================
// Polyfills for pdfjs-dist in Node.js serverless/worker environment
// These MUST be set before any pdfjs-dist import happens.
// We prefer native DOMMatrix and Path2D from @napi-rs/canvas to avoid native type matching failures.
// ============================================================

try {
  // @ts-ignore
  const canvas = require("@napi-rs/canvas");
  if (canvas.DOMMatrix) {
    (globalThis as any).DOMMatrix = canvas.DOMMatrix;
  }
  if (canvas.Path2D) {
    (globalThis as any).Path2D = canvas.Path2D;
  }
} catch (err: any) {
  console.warn("⚠️ Failed to load native @napi-rs/canvas polyfills, using mock fallbacks:", err.message);
}

// Polyfill DOMMatrix fallback if still undefined
if (typeof (globalThis as any).DOMMatrix === "undefined") {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    m11 = 1;
    m12 = 0;
    m13 = 0;
    m14 = 0;
    m21 = 0;
    m22 = 1;
    m23 = 0;
    m24 = 0;
    m31 = 0;
    m32 = 0;
    m33 = 1;
    m34 = 0;
    m41 = 0;
    m42 = 0;
    m43 = 0;
    m44 = 1;
    is2D = true;
    isIdentity = true;
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
    translate() {
      return new (globalThis as any).DOMMatrix();
    }
    scale() {
      return new (globalThis as any).DOMMatrix();
    }
    multiply() {
      return new (globalThis as any).DOMMatrix();
    }
    inverse() {
      return new (globalThis as any).DOMMatrix();
    }
    transformPoint(p: any) {
      return { x: p?.x ?? 0, y: p?.y ?? 0, z: 0, w: 1 };
    }
  };
}

// Polyfill Path2D fallback (required by pdfjs canvas renderer) if still undefined
if (typeof (globalThis as any).Path2D === "undefined") {
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
// Pre-load pdfjs worker onto globalThis to prevent worker errors.
// ============================================================
async function preloadPdfjsWorker(): Promise<void> {
  if ((globalThis as any).pdfjsWorker) return; // already loaded
  try {
    // @ts-ignore
    const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    (globalThis as any).pdfjsWorker = workerModule;
    console.log("✅ Pre-loaded pdfjs worker onto globalThis.pdfjsWorker");
  } catch (err: any) {
    console.warn("⚠️ Failed to pre-load pdfjs worker:", err.message);
  }
}

// Fire-and-forget the preload (it's cached after first call)
const _pdfjsWorkerReady = preloadPdfjsWorker();

// @ts-ignore
import pdfParse from "pdf-parse";

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
  method: "groq-llm" | "regex-fallback";
  rawText?: string; // for debug logging
}

/**
 * Run Tesseract.js OCR on a PDF buffer for scanned PDFs.
 * Converts PDF pages to PNG images and runs OCR on each page individually.
 */
async function runTesseractOCRPages(pdfBuffer: Buffer): Promise<string[]> {
  console.log("Converting PDF pages to PNG images for OCR...");
  try {
    // Ensure pdfjs worker is pre-loaded
    await _pdfjsWorkerReady;

    // Suppress canvas warnings - pdfjs will fall back gracefully
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: any[]) => {
      const msg = args.join(" ");
      if (!msg.includes("canvas") && !msg.includes("Canvas")) {
        originalWarn(...args);
      }
      warnings.push(msg);
    };

    try {
      const { pdfToPng } = await import("pdf-to-png-converter");
      const pngPages = await pdfToPng(pdfBuffer, { viewportScale: 2.0 });
      console.log(
        `Successfully converted PDF to ${pngPages.length} PNG pages.`,
      );

      const TesseractModule = await import("tesseract.js");
      const Tesseract = (TesseractModule as any).default || TesseractModule;

      const pagesText: string[] = [];
      for (let i = 0; i < pngPages.length; i++) {
        console.log(`Running OCR on page ${i + 1}/${pngPages.length}...`);
        const { data } = await Tesseract.recognize(pngPages[i].content, "eng");
        pagesText.push(data.text || "");
      }

      return pagesText;
    } finally {
      console.warn = originalWarn;
    }
  } catch (err: any) {
    console.error("⚠️ Tesseract OCR with PDF conversion failed:", err.message);
    if (err.stack) console.error("Stack trace:", err.stack);
    throw err;
  }
}

async function extractTextPagesWithPdfJs(buffer: Buffer): Promise<string[]> {
  await _pdfjsWorkerReady;
  // @ts-ignore
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    disableAutoFetch: true,
    disableStream: true,
  });

  const doc = await loadingTask.promise;
  const pagesText: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    pagesText.push(pageText);
    page.cleanup();
  }

  doc.cleanup();
  return pagesText;
}

/**
 * Parse a BIT Mesra format timetable PDF page-by-page using Groq LLM or regex fallback.
 * Automatically splits multi-page PDFs to parse each page individually.
 */
export async function parseTimetablePdf(
  buffer: Buffer,
): Promise<ParseResult> {
  const errors: Array<{ line: number; message: string }> = [];
  let pagesText: string[] = [];

  // --- Step 1: Try Native PDF Text Extraction ---
  try {
    console.log("Attempting text extraction with pdfjs-dist...");
    pagesText = await extractTextPagesWithPdfJs(buffer);
    console.log(`pdfjs-dist extracted ${pagesText.length} pages of text`);
  } catch (pdfjsErr: any) {
    console.warn("⚠️ pdfjs-dist text extraction failed:", pdfjsErr.message);
    errors.push({
      line: 0,
      message: `pdfjs-dist text extraction failed: ${pdfjsErr.message}`,
    });
  }

  // --- Step 2: Fallback to pdf-parse if we got no text or empty pages ---
  const totalLength = pagesText.reduce((acc, p) => acc + p.trim().length, 0);
  if (totalLength < 50) {
    try {
      console.log("Attempting fallback text extraction with pdf-parse...");
      const result = await pdfParse(buffer);
      const parsedText = result.text || "";
      console.log(`pdf-parse extracted ${parsedText.trim().length} characters`);
      pagesText = parsedText.split(/\f/).map(p => p.trim()).filter(Boolean);
    } catch (pdfErr: any) {
      console.warn("⚠️ pdf-parse failed:", pdfErr.message);
      errors.push({ line: 0, message: `pdf-parse failed: ${pdfErr.message}` });
    }
  }

  // --- Step 3: Fallback to Tesseract OCR if text length is still too low ---
  const checkLength = pagesText.reduce((acc, p) => acc + p.trim().length, 0);
  if (checkLength < 30) {
    console.log(
      "ℹ️ PDF contains insufficient readable text. Attempting Tesseract.js OCR for scanned PDF...",
    );
    try {
      pagesText = await runTesseractOCRPages(buffer);
      console.log(`✅ Tesseract.js OCR completed for ${pagesText.length} pages`);
    } catch (ocrErr: any) {
      console.error("⚠️ Tesseract.js OCR failed:", ocrErr.message);
      errors.push({
        line: 0,
        message: `Tesseract.js OCR failed: ${ocrErr.message}`,
      });
    }
  }

  // If we still have no pages, return failure
  if (pagesText.length === 0 || pagesText.reduce((acc, p) => acc + p.trim().length, 0) < 30) {
    return {
      rows: [],
      errors: [
        ...errors,
        {
          line: 0,
          message:
            "PDF contains no readable text. Both text extraction and OCR failed.",
        },
      ],
      method: "regex-fallback",
      rawText: "(empty)",
    };
  }

  // --- Step 4: Parse each page individually and merge results ---
  const allRows: ParsedTimetableRow[] = [];
  let method: "groq-llm" | "regex-fallback" = "regex-fallback";
  const apiKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;

  console.log(`Processing ${pagesText.length} pages individually...`);

  for (let i = 0; i < pagesText.length; i++) {
    const pageText = pagesText[i];
    if (pageText.trim().length < 30) {
      console.log(`Skipping empty page ${i + 1}`);
      continue;
    }

    console.log(`Parsing Page ${i + 1}/${pagesText.length}...`);

    if (apiKey) {
      try {
        const pageResult = await parsePageWithGroqTwoPass(pageText, i + 1, apiKey);
        if (pageResult.rows.length > 0) {
          allRows.push(...pageResult.rows);
          method = "groq-llm";
        }
        if (pageResult.errors.length > 0) {
          errors.push(...pageResult.errors);
        }
      } catch (err: any) {
        console.warn(`⚠️ Groq parsing failed for Page ${i + 1}, falling back to regex:`, err.message);
        const regexResult = parseWithRegex(pageText, i + 1);
        allRows.push(...regexResult.rows);
        errors.push(...regexResult.errors);
      }
    } else {
      console.log(`ℹ️ GROQ_API_KEY not set. Using regex parser for Page ${i + 1}.`);
      const regexResult = parseWithRegex(pageText, i + 1);
      allRows.push(...regexResult.rows);
      errors.push(...regexResult.errors);
    }

    // Rate limit buffer between pages to avoid hitting TPM limits
    if (i < pagesText.length - 1 && apiKey) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return {
    rows: allRows,
    errors,
    method,
    rawText: pagesText.join("\n\n--- Page Break ---\n\n").substring(0, 4000),
  };
}

/**
 * Two-pass Groq LLM extraction for an individual timetable page.
 */
async function parsePageWithGroqTwoPass(
  pageText: string,
  pageNum: number,
  apiKey: string,
): Promise<{ rows: ParsedTimetableRow[]; errors: Array<{ line: number; message: string }> }> {
  console.log(`🤖 Starting Groq LLM extraction for Page ${pageNum}...`);

  const response = await callGroqAPI(apiKey, [
    {
      role: "system",
      content: TIMETABLE_EXTRACTION_PROMPT,
    },
    {
      role: "user",
      content: `Parse this timetable page. Extract EVERY class/lab slot.\n\n${pageText}`,
    },
  ]);

  const rows: ParsedTimetableRow[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  if (response) {
    try {
      const parsed = JSON.parse(response);
      if (parsed && Array.isArray(parsed.rows)) {
        for (const row of parsed.rows) {
          if (isValidRow(row)) {
            rows.push({
              day: capitalizeDay(row.day),
              period: Number(row.period),
              courseCode: String(row.courseCode || row.course_code || "").trim(),
              facultyName: String(row.facultyName || row.faculty_name || row.faculty || "").trim(),
              roomNumber: String(row.roomNumber || row.room_number || row.room || "").trim(),
              section: String(row.section || "").trim(),
              duration: normalizeDuration(row.duration),
            });
          } else {
            errors.push({
              line: pageNum * 100 + rows.length,
              message: `[Page ${pageNum}] Invalid row details: ${JSON.stringify(row)}`,
            });
          }
        }
      }
    } catch (parseErr: any) {
      errors.push({
        line: pageNum * 100,
        message: `[Page ${pageNum}] Failed to parse Groq JSON response: ${parseErr.message}`,
      });
    }
  }

  // Resolve course abbreviations on the page (Pass 2)
  const unresolvedRows = rows.filter(
    (r) => r.courseCode && !r.courseCode.match(/^[A-Z]{2,4}\d{3,5}[A-Z]?$/i),
  );

  if (unresolvedRows.length > 0) {
    console.log(`🔄 [Page ${pageNum}] Resolving ${unresolvedRows.length} abbreviations...`);
    try {
      const resolutionMap = await resolveCourseAbbreviations(
        pageText,
        unresolvedRows,
        apiKey,
      );
      if (resolutionMap) {
        for (const row of rows) {
          const key = row.courseCode.toUpperCase().trim();
          if (resolutionMap[key]) {
            const resolved = resolutionMap[key];
            if (resolved.courseCode) row.courseCode = resolved.courseCode;
            if (resolved.facultyName && !row.facultyName)
              row.facultyName = resolved.facultyName;
          }
        }
      }
    } catch (resolveErr: any) {
      errors.push({
        line: pageNum * 100 - 1,
        message: `[WARNING][Page ${pageNum}] Pass 2 course code resolution failed: ${resolveErr.message}`,
      });
    }
  }

  return { rows, errors };
}

async function resolveCourseAbbreviations(
  fullText: string,
  unresolvedRows: ParsedTimetableRow[],
  apiKey: string,
): Promise<Record<string, { courseCode: string; facultyName: string }> | null> {
  const uniqueAbbrevs = [
    ...new Set(unresolvedRows.map((r) => r.courseCode.trim())),
  ];

  const response = await callGroqAPI(apiKey, [
    {
      role: "system",
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
      role: "user",
      content: `Resolve these abbreviations: ${JSON.stringify(uniqueAbbrevs)}\n\nFull timetable text:\n${fullText.substring(0, 10000)}`,
    },
  ]);

  if (response) {
    const parsed = JSON.parse(response);
    const normalized: Record<
      string,
      { courseCode: string; facultyName: string }
    > = {};
    for (const [key, value] of Object.entries(parsed)) {
      normalized[key.toUpperCase().trim()] = value as {
        courseCode: string;
        facultyName: string;
      };
    }
    return normalized;
  }
  return null;
}

async function callGroqAPI(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  retries = 3,
  delaySec = 10,
): Promise<string | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages,
            response_format: { type: "json_object" },
            temperature: 0.0,
            max_tokens: 8192,
          }),
        },
      );

      if (response.status === 429) {
        // Rate limit hit - extract wait time
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error?.message || "";
        
        let waitMs = delaySec * 1000;
        const match = message.match(/try again in ([\d\.]+)s/i);
        if (match) {
          waitMs = Math.ceil(parseFloat(match[1]) * 1000) + 1500; // Add 1.5s buffer
        } else {
          const retryHeader = response.headers.get("retry-after");
          if (retryHeader) {
            waitMs = (parseInt(retryHeader, 10) || delaySec) * 1000 + 1500;
          }
        }

        console.warn(`⚠️ Groq Rate Limit (429) hit. Waiting ${Math.ceil(waitMs / 1000)}s before retry attempt ${attempt}/${retries}...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Groq API returned status ${response.status}: ${errorText}`,
        );
      }

      const resBody = await response.json();
      return resBody.choices?.[0]?.message?.content || null;
    } catch (err: any) {
      if (attempt === retries) throw err;
      console.warn(`⚠️ Groq API connection error on attempt ${attempt}/${retries}: ${err.message}. Retrying in ${delaySec}s...`);
      await new Promise((r) => setTimeout(r, delaySec * 1000));
    }
  }
  return null;
}

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

function isValidRow(row: any): boolean {
  if (!row || typeof row !== "object") return false;
  if (!row.day) return false;
  const courseCode = row.courseCode || row.course_code || "";
  if (!courseCode || String(courseCode).trim().length === 0) return false;
  const period = Number(row.period);
  if (isNaN(period) || period < 1 || period > 9) return false;
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
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
  };
  return dayMap[day.toLowerCase()] || day;
}

function parseWithRegex(text: string, pageNum: number): {
  rows: ParsedTimetableRow[];
  errors: Array<{ line: number; message: string }>;
} {
  const rows: ParsedTimetableRow[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const dayMap: Record<string, string> = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
  };

  let currentSection = "";
  let currentDay = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const sectionMatch =
      line.match(/section[:\s]*([A-Z0-9\s-]+)/i) ||
      line.match(/^([A-Z]+)\s+(VI|IV|VIII|II|X)\s+([A-D])$/i);
    if (sectionMatch) {
      currentSection = sectionMatch[0].replace(/section[:\s]*/i, "").trim();
      continue;
    }

    const dayWord = line.toLowerCase().split(/\s+/)[0];
    if (dayMap[dayWord]) {
      currentDay = dayMap[dayWord];
    }

    const cellMatch = line.match(
      /([A-Z]{2,4}\d{3}[A-Z]?)\s*[\/\n\s]+\s*([^\/\n]+?)\s*[\/\n\s]+\s*([A-Za-z0-9-]+)/,
    );
    if (cellMatch && currentDay) {
      const courseCode = cellMatch[1].trim();
      const facultyName = cellMatch[2].trim();
      const roomNumber = cellMatch[3].trim();

      const periodMatch = line.match(/P(\d)/i) || line.match(/period\s*(\d)/i);
      const period = periodMatch
        ? parseInt(periodMatch[1])
        : estimatePeriod(i, lines);

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
        errors.push({
          line: pageNum * 100 + i,
          message: `[Page ${pageNum}] Could not determine period for line: ${line}`,
        });
      }
    }
  }

  for (let i = 0; i < rows.length - 1; i++) {
    if (
      rows[i].courseCode === rows[i + 1]?.courseCode &&
      rows[i].roomNumber === rows[i + 1]?.roomNumber &&
      rows[i].day === rows[i + 1]?.day &&
      rows[i + 1].period === rows[i].period + 1
    ) {
      rows[i].duration++;
      rows.splice(i + 1, 1);
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
