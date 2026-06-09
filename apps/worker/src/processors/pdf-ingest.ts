import { getSupabase } from '../lib/supabase';
import { parseTimetablePdf } from '../lib/pdf-parser';
import { fuzzyMatch } from '../lib/fuzzy-match';
import pino from 'pino';

const pinoLogger = pino({ name: 'pdf-ingest-processor' });

export interface PdfIngestJobData {
  file_path: string;
  department_id: string;
  correlation_id?: string;
}

const DAYS_MAP: Record<string, number> = {
  Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7,
};

export async function processPdfIngest(data: PdfIngestJobData) {
  const correlationId = data.correlation_id || `cor_fallback_${Date.now()}`;
  const logger = pinoLogger.child({ correlationId });
  const supabase = getSupabase();
  const { file_path, department_id } = data;

  // Find the ingestion record
  const { data: ingestion } = await supabase
    .from('pdf_ingestions')
    .select('id')
    .eq('file_path', file_path)
    .single();

  if (!ingestion) {
    logger.error({ file_path }, 'Ingestion record not found');
    return;
  }

  const ingestionId = ingestion.id;

  try {
    // Step 1: Update status to 'parsing'
    await supabase.from('pdf_ingestions').update({
      status: 'parsing',
      started_at: new Date().toISOString(),
    }).eq('id', ingestionId);

    // Step 2: Retrieve PDF content from database row
    const { data: contentData, error: contentError } = await supabase
      .from('pdf_ingestions')
      .select('file_content')
      .eq('id', ingestionId)
      .single();

    if (contentError || !contentData || !contentData.file_content) {
      throw new Error(`Failed to retrieve PDF content from database: ${contentError?.message || 'No content'}`);
    }

    const buffer = Buffer.from(contentData.file_content, 'base64');

    // Step 3: Parse PDF
    const { rows, errors: parseErrors } = await parseTimetablePdf(buffer);

    logger.info({ rowCount: rows.length, errorCount: parseErrors.length }, 'PDF parsed');

    // Step 4: Update status to 'integrating'
    await supabase.from('pdf_ingestions').update({
      status: 'integrating',
      rows_total: rows.length,
    }).eq('id', ingestionId);

    // Step 5: Fetch lookup data
    const [facultyRes, coursesRes, roomsRes, sectionsRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name').is('deleted_at', null),
      supabase.from('courses').select('id, code').eq('department_id', department_id).is('deleted_at', null),
      supabase.from('rooms').select('id, room_number').eq('department_id', department_id).is('deleted_at', null),
      supabase.from('sections').select('id, section_label, branch, semester').eq('department_id', department_id),
    ]);

    const facultyNames = (facultyRes.data || []).map((f) => f.full_name);
    const courseMap = new Map((coursesRes.data || []).map((c) => [c.code.toUpperCase(), c.id]));
    const roomMap = new Map((roomsRes.data || []).map((r) => [r.room_number.toUpperCase(), r.id]));

    // Step 6: Process each row
    let created = 0;
    let matched = 0;
    let failed = 0;
    const errorLog: Array<{ row: number; message: string; data?: unknown }> = [
      ...parseErrors.map((e) => ({ row: e.line, message: e.message })),
    ];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      try {
        // Resolve course
        const courseId = courseMap.get(row.courseCode.toUpperCase());
        if (!courseId) {
          errorLog.push({ row: i + 1, message: `Course not found: ${row.courseCode}`, data: row });
          failed++;
          continue;
        }

        // Resolve room
        const roomId = roomMap.get(row.roomNumber.toUpperCase());
        if (!roomId) {
          errorLog.push({ row: i + 1, message: `Room not found: ${row.roomNumber}`, data: row });
          failed++;
          continue;
        }

        // Fuzzy match faculty
        let facultyId: string | null = null;
        if (row.facultyName) {
          const match = fuzzyMatch(row.facultyName, facultyNames);
          if (match) {
            const faculty = (facultyRes.data || []).find((f) => f.full_name === match.match);
            facultyId = faculty?.id || null;
            if (match.score < 1) {
              logger.info({ input: row.facultyName, matched: match.match, score: match.score }, 'Fuzzy matched faculty');
            }
          } else {
            errorLog.push({ row: i + 1, message: `Faculty not matched: ${row.facultyName}` });
          }
        }

        // Resolve section
        const section = (sectionsRes.data || []).find(
          (s) => s.section_label === row.section || s.section_label === row.section.slice(-1)
        );

        if (!section) {
          errorLog.push({ row: i + 1, message: `Section not found: ${row.section}`, data: row });
          failed++;
          continue;
        }

        // Resolve day
        const dayOfWeek = DAYS_MAP[row.day];
        if (!dayOfWeek) {
          errorLog.push({ row: i + 1, message: `Invalid day: ${row.day}` });
          failed++;
          continue;
        }

        // Check for existing entry
        const { data: existing } = await supabase
          .from('timetable_entries')
          .select('id')
          .eq('section_id', section.id)
          .eq('day_of_week', dayOfWeek)
          .eq('period', row.period)
          .maybeSingle();

        if (existing) {
          matched++;
          continue;
        }

        // Insert timetable entry
        const { error: insertError } = await supabase.from('timetable_entries').insert({
          course_id: courseId,
          faculty_id: facultyId,
          room_id: roomId,
          section_id: section.id,
          day_of_week: dayOfWeek,
          period: row.period,
          slot_duration_minutes: row.duration > 1 ? 110 : 55,
          source_ingestion_id: ingestionId,
        });

        if (insertError) {
          errorLog.push({ row: i + 1, message: insertError.message, data: row });
          failed++;
        } else {
          created++;
        }
      } catch (rowError: any) {
        errorLog.push({ row: i + 1, message: rowError.message, data: row });
        failed++;
      }
    }

    // Step 7: Finalize
    const finalStatus = failed === rows.length ? 'failed' : failed > 0 ? 'partial' : 'done';

    await supabase.from('pdf_ingestions').update({
      status: finalStatus,
      rows_created: created,
      rows_matched: matched,
      rows_failed: failed,
      error_log: errorLog,
      finished_at: new Date().toISOString(),
    }).eq('id', ingestionId);

    logger.info({ ingestionId, created, matched, failed, status: finalStatus }, 'PDF ingestion completed');

  } catch (error: any) {
    logger.error({ ingestionId, error: error.message }, 'PDF ingestion failed');

    await supabase.from('pdf_ingestions').update({
      status: 'failed',
      error_log: [{ row: 0, message: error.message }],
      finished_at: new Date().toISOString(),
    }).eq('id', ingestionId);
  }
}
