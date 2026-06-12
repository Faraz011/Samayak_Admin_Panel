import { getSupabase } from '../lib/supabase';
import { parseTimetablePdf } from '../lib/pdf-parser';
import { fuzzyMatch } from '../lib/fuzzy-match';
import pino from 'pino';

const pinoLogger = pino({ name: 'pdf-ingest-processor' });

export interface PdfIngestJobData {
  file_path: string;
  department_id: string;
  correlation_id?: string;
  ingestion_id?: string;
}

const DAYS_MAP: Record<string, number> = {
  Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7,
};

function inferSemester(section: string): number {
  const upper = section.toUpperCase();
  if (upper.includes('VIII') || upper.includes('8')) return 8;
  if (upper.includes('VII') || upper.includes('7')) return 7;
  if (upper.includes('VI') || upper.includes('6')) return 6;
  if (upper.includes('V') || upper.includes('5')) return 5;
  if (upper.includes('IV') || upper.includes('4')) return 4;
  if (upper.includes('III') || upper.includes('3')) return 3;
  if (upper.includes('II') || upper.includes('2')) return 2;
  if (upper.includes('I') || upper.includes('1')) return 1;
  return 6; // default fallback
}

function inferBranch(section: string, deptShortCode: string): string {
  const upper = section.toUpperCase();
  if (upper.includes('AIML')) return 'AIML';
  if (upper.includes('MCA')) return 'MCA';
  if (upper.includes('MTCS') || upper.includes('M.TECH')) return 'MTCS';
  if (upper.includes('CSE')) return 'CSE';
  return deptShortCode || 'CSE';
}

function durationToMinutes(duration: number): number {
  switch (duration) {
    case 3: return 165; // 3 periods × 55 min
    case 2: return 110; // 2 periods × 55 min
    default: return 55;  // 1 period
  }
}

export async function processPdfIngest(data: PdfIngestJobData) {
  const correlationId = data.correlation_id || `cor_fallback_${Date.now()}`;
  const logger = pinoLogger.child({ correlationId });
  const supabase = getSupabase();
  const { file_path, department_id } = data;

  // Retrieve the ingestion record
  let ingestionId = data.ingestion_id;
  if (!ingestionId) {
    const { data: ingestion } = await supabase
      .from('pdf_ingestions')
      .select('id')
      .eq('file_path', file_path)
      .single();

    if (!ingestion) {
      logger.error({ file_path }, 'Ingestion record not found in database');
      return;
    }
    ingestionId = ingestion.id;
  }

  try {
    // 1. Update status to 'parsing'
    await supabase.from('pdf_ingestions').update({
      status: 'parsing',
      started_at: new Date().toISOString(),
    }).eq('id', ingestionId);

    // 2. Fetch the department short code
    const { data: dept } = await supabase
      .from('departments')
      .select('short_code')
      .eq('id', department_id)
      .single();

    const deptShortCode = dept?.short_code || 'CSE';

    // 3. Retrieve PDF content from database row
    const { data: contentData, error: contentError } = await supabase
      .from('pdf_ingestions')
      .select('file_content')
      .eq('id', ingestionId)
      .single();

    if (contentError || !contentData || !contentData.file_content) {
      throw new Error(`Failed to retrieve PDF content from database: ${contentError?.message || 'No content'}`);
    }

    const buffer = Buffer.from(contentData.file_content, 'base64');

    // 4. Parse PDF
    logger.info(`[Ingestion ${ingestionId}] Starting PDF parse...`);
    const parseResult = await parseTimetablePdf(buffer);
    logger.info(`[Ingestion ${ingestionId}] Parsed ${parseResult.rows.length} rows using ${parseResult.method}`);

    // 5. Update status to 'integrating'
    await supabase.from('pdf_ingestions').update({
      status: 'integrating',
      rows_total: parseResult.rows.length,
    }).eq('id', ingestionId);

    // 6. Fetch lookup data
    const [facultyRes, coursesRes, roomsRes, sectionsRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name').is('deleted_at', null),
      supabase.from('courses').select('id, code, semester, branch').eq('department_id', department_id).is('deleted_at', null),
      supabase.from('rooms').select('id, room_number').eq('department_id', department_id).is('deleted_at', null),
      supabase.from('sections').select('id, section_label, branch, semester').eq('department_id', department_id),
    ]);

    const facultyList = facultyRes.data || [];
    const facultyNames = facultyList.map((f) => f.full_name);

    interface CourseLookup {
      id: string;
      code: string;
      semester: number;
      branch: string;
    }
    interface RoomLookup {
      id: string;
      room_number: string;
    }
    interface SectionLookup {
      id: string;
      section_label: string;
      branch: string;
      semester: number;
    }

    const courses: CourseLookup[] = (coursesRes.data || []).map((c: any) => ({
      id: c.id,
      code: c.code,
      semester: c.semester,
      branch: c.branch,
    }));
    const rooms: RoomLookup[] = (roomsRes.data || []).map((r: any) => ({
      id: r.id,
      room_number: r.room_number,
    }));
    const sections: SectionLookup[] = (sectionsRes.data || []).map((s: any) => ({
      id: s.id,
      section_label: s.section_label,
      branch: s.branch,
      semester: s.semester,
    }));

    // 7. Process each row
    let createdCount = 0;
    let matchedCount = 0;
    let failedCount = 0;

    const errorLog: Array<{ row: number; message: string; data?: any }> = [
      ...parseResult.errors.map((e) => ({ row: e.line, message: e.message })),
    ];

    // Add raw text preview to error log for debugging
    if (parseResult.rawText) {
      errorLog.unshift({
        row: 0,
        message: `[DEBUG] Extracted text preview (first 500 chars): ${parseResult.rawText.substring(0, 500).replace(/\n/g, ' | ')}`,
      });
    }

    for (let i = 0; i < parseResult.rows.length; i++) {
      const row = parseResult.rows[i];

      try {
        // === Resolve course ===
        let course: CourseLookup | undefined = courses.find(
          (c) => c.code.toUpperCase() === row.courseCode.toUpperCase()
        );

        if (!course) {
          // Try partial match (e.g. "CS333" should match "CS33301")
          course = courses.find(
            (c) => c.code.toUpperCase().startsWith(row.courseCode.toUpperCase()) ||
                   row.courseCode.toUpperCase().startsWith(c.code.toUpperCase())
          );
        }

        if (!course) {
          // Auto-create course
          const inferredSem = inferSemester(row.section);
          const inferredBr = inferBranch(row.section, deptShortCode);
          logger.info(`Course not found: ${row.courseCode}. Auto-creating for Sem ${inferredSem}, Branch ${inferredBr}`);

          const isLab = row.duration > 1 || row.courseCode.toLowerCase().includes('lab') || row.courseCode.toLowerCase().endsWith('l');

          const { data: newCourse, error: courseCreateError } = await supabase
            .from('courses')
            .insert({
              code: row.courseCode.toUpperCase(),
              name: `${row.courseCode} (Auto-created)`,
              credits: isLab ? 1 : 3,
              course_type: isLab ? 'lab' : 'lecture',
              department_id: department_id,
              branch: inferredBr,
              semester: inferredSem,
            })
            .select()
            .single();

          if (courseCreateError || !newCourse) {
            errorLog.push({
              row: i + 1,
              message: `Course not found and auto-creation failed: ${row.courseCode} (${courseCreateError?.message})`,
              data: row,
            });
            failedCount++;
            continue;
          }

          course = {
            id: newCourse.id,
            code: newCourse.code,
            semester: newCourse.semester,
            branch: newCourse.branch,
          };
          courses.push(course);
          errorLog.push({
            row: i + 1,
            message: `[INFO] Course ${row.courseCode} was not found and has been auto-created.`,
          });
        }

        const resolvedCourse = course;

        // === Resolve room (OPTIONAL — allow null) ===
        let roomId: string | null = null;
        if (row.roomNumber && row.roomNumber.trim()) {
          let room: RoomLookup | undefined = rooms.find(
            (r) => r.room_number.toUpperCase() === row.roomNumber.toUpperCase()
          );

          if (!room) {
            // Fuzzy room match (e.g. "Lab-4" vs "Lab 4")
            const normalizedRoomInput = row.roomNumber.replace(/[-_]/g, ' ').trim();
            room = rooms.find(
              (r) => r.room_number.replace(/[-_]/g, ' ').toUpperCase() === normalizedRoomInput.toUpperCase()
            );
          }

          if (!room) {
            // Auto-create room
            logger.info(`Room not found: ${row.roomNumber}. Auto-creating...`);
            const isLab = row.roomNumber.toLowerCase().includes('lab') || row.courseCode.toLowerCase().includes('lab');

            const { data: newRoom, error: roomCreateError } = await supabase
              .from('rooms')
              .insert({
                room_number: row.roomNumber,
                department_id: department_id,
                capacity: 60,
                room_type: isLab ? 'lab' : 'classroom',
              })
              .select()
              .single();

            if (roomCreateError || !newRoom) {
              errorLog.push({
                row: i + 1,
                message: `[WARNING] Room "${row.roomNumber}" could not be auto-created: ${roomCreateError?.message}. Entry will have no room.`,
              });
            } else {
              const newRoomLookup: RoomLookup = {
                id: newRoom.id,
                room_number: newRoom.room_number,
              };
              rooms.push(newRoomLookup);
              roomId = newRoom.id;
              errorLog.push({
                row: i + 1,
                message: `[INFO] Room ${row.roomNumber} was not found and has been auto-created.`,
              });
            }
          } else {
            roomId = room.id;
          }
        }

        // === Resolve Faculty (OPTIONAL — allow null) ===
        let facultyId: string | null = null;
        if (row.facultyName && row.facultyName.trim()) {
          const match = fuzzyMatch(row.facultyName, facultyNames);
          if (match) {
            const faculty = facultyList.find((f) => f.full_name === match.match);
            facultyId = faculty?.id || null;
            if (match.score < 1) {
              logger.info(`Faculty fuzzy match: "${row.facultyName}" -> "${match.match}" (score: ${match.score.toFixed(2)}, method: ${match.method})`);
            }
          } else {
            errorLog.push({
              row: i + 1,
              message: `[WARNING] Faculty name "${row.facultyName}" could not be matched. Slot will have no faculty assigned.`,
            });
          }
        }

        // === Clean section label ===
        let sectionLabel = row.section.trim();
        if (sectionLabel.length > 1) {
          const match = sectionLabel.match(/\b([A-D])\b/i);
          if (match) {
            sectionLabel = match[1].toUpperCase();
          }
        }

        // Default section label if empty
        if (!sectionLabel) {
          sectionLabel = 'A';
          errorLog.push({
            row: i + 1,
            message: `[WARNING] No section found for this entry. Defaulting to "A".`,
          });
        }

        // === Resolve Section ===
        let section: SectionLookup | undefined = sections.find(
          (s) =>
            s.section_label.toUpperCase() === sectionLabel.toUpperCase() &&
            s.semester === resolvedCourse.semester &&
            s.branch.toUpperCase() === resolvedCourse.branch.toUpperCase()
        );

        if (!section) {
          logger.info(`Section not found for Branch: ${resolvedCourse.branch}, Sem: ${resolvedCourse.semester}, Label: ${sectionLabel}. Auto-creating...`);
          const { data: newSection, error: sectionCreateError } = await supabase
            .from('sections')
            .insert({
              department_id: department_id,
              branch: resolvedCourse.branch,
              semester: resolvedCourse.semester,
              section_label: sectionLabel.toUpperCase(),
            })
            .select()
            .single();

          if (sectionCreateError || !newSection) {
            errorLog.push({
              row: i + 1,
              message: `Section not found and auto-creation failed: ${row.section} (${sectionCreateError?.message})`,
              data: row,
            });
            failedCount++;
            continue;
          }

          section = {
            id: newSection.id,
            section_label: newSection.section_label,
            branch: newSection.branch,
            semester: newSection.semester,
          };
          sections.push(section);
          errorLog.push({
            row: i + 1,
            message: `[INFO] Section ${resolvedCourse.branch} Sem ${resolvedCourse.semester} Section ${sectionLabel} was auto-created.`,
          });
        }

        const resolvedSection = section;

        // === Resolve day of week ===
        const dayOfWeek = DAYS_MAP[row.day];
        if (!dayOfWeek) {
          errorLog.push({
            row: i + 1,
            message: `Invalid day of week: ${row.day}`,
            data: row,
          });
          failedCount++;
          continue;
        }

        // === Check for existing timetable entry ===
        const { data: existing } = await supabase
          .from('timetable_entries')
          .select('id')
          .eq('section_id', resolvedSection.id)
          .eq('day_of_week', dayOfWeek)
          .eq('period', row.period)
          .maybeSingle();

        if (existing) {
          const { error: updateError } = await supabase
            .from('timetable_entries')
            .update({
              course_id: resolvedCourse.id,
              faculty_id: facultyId,
              room_id: roomId,
              slot_duration_minutes: durationToMinutes(row.duration),
              source_ingestion_id: ingestionId,
            })
            .eq('id', existing.id);

          if (updateError) {
            errorLog.push({
              row: i + 1,
              message: `Failed to update existing entry: ${updateError.message}`,
              data: row,
            });
            failedCount++;
          } else {
            matchedCount++;
          }
        } else {
          const { error: insertError } = await supabase
            .from('timetable_entries')
            .insert({
              course_id: resolvedCourse.id,
              faculty_id: facultyId,
              room_id: roomId,
              section_id: resolvedSection.id,
              day_of_week: dayOfWeek,
              period: row.period,
              slot_duration_minutes: durationToMinutes(row.duration),
              source_ingestion_id: ingestionId,
            });

          if (insertError) {
            errorLog.push({
              row: i + 1,
              message: `Failed to insert entry: ${insertError.message}`,
              data: row,
            });
            failedCount++;
          } else {
            createdCount++;
          }
        }
      } catch (rowErr: any) {
        errorLog.push({
          row: i + 1,
          message: `Unexpected error processing row: ${rowErr.message}`,
          data: row,
        });
        failedCount++;
      }
    }

    // 8. Determine final status
    let finalStatus: 'done' | 'failed' | 'partial' = 'done';
    if (failedCount === parseResult.rows.length && parseResult.rows.length > 0) {
      finalStatus = 'failed';
    } else if (failedCount > 0) {
      finalStatus = 'partial';
    }

    await supabase
      .from('pdf_ingestions')
      .update({
        status: finalStatus,
        rows_created: createdCount,
        rows_matched: matchedCount,
        rows_failed: failedCount,
        error_log: errorLog,
        finished_at: new Date().toISOString(),
      })
      .eq('id', ingestionId);

    logger.info(`[Ingestion ${ingestionId}] Completed processing with status: ${finalStatus}. Created: ${createdCount}, Matched: ${matchedCount}, Failed: ${failedCount}`);

  } catch (error: any) {
    logger.error({ ingestionId, error: error.message }, 'Fatal error in PDF processing');

    // Fallback: update status to failed in database
    await supabase
      .from('pdf_ingestions')
      .update({
        status: 'failed',
        error_log: [{ row: 0, message: `Fatal error: ${error.message}` }],
        finished_at: new Date().toISOString(),
      })
      .eq('id', ingestionId);
  }
}
