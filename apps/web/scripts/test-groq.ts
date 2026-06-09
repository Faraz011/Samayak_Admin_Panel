import * as fs from 'fs';
import * as path from 'path';

// Mock WebSocket for Node.js < 22 environments
if (typeof (global as any).WebSocket === 'undefined') {
  (global as any).WebSocket = class {};
}

function loadEnv(filePath: string) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        } else if (val.startsWith("'") && val.endsWith("'")) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    }
  }
}

// Load env files
loadEnv(path.join(__dirname, '../../.env'));
loadEnv(path.join(__dirname, '../.env.local'));

import { createClient } from '@supabase/supabase-js';
import { fuzzyMatch } from '../lib/fuzzy-match';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

const sampleTimetableText = `
Birla Institute of Technology, Mesra, Ranchi
Department of Computer Science & Engineering
CLASS TIME TABLE - SPRING 2026

CSE Semester VI - Section A
Monday: 
Period 1 (9:00-9:55): CS301 / Dr. Rakesh Sharma / Room 219
Period 2 (10:00-10:55): CS305 / Prof. Amit Kumar / Room 219
Period 3 (11:00-11:55): CS307 / Dr. Sanjay Gupta / Room 220
Period 5 (1:00-1:55): CS313 / Prof. Meera Singh / Room Lab-1 (Lab - Double Period)
Period 6 (2:00-2:55): CS313 / Prof. Meera Singh / Room Lab-1 (Lab - Double Period)

Tuesday:
Period 1 (9:00-9:55): CS305 / Prof. Amit Kumar / Room 219
Period 2 (10:00-10:55): CS201 / Dr. Vijay Patel / Room 219
Period 3 (11:00-11:55): CS301 / Dr. Rakesh Sharma / Room 220
Period 5 (1:00-1:55): CS315 / Dr. Sanjay Gupta / Room Lab-2 (Lab - Double Period)
Period 6 (2:00-2:55): CS315 / Dr. Sanjay Gupta / Room Lab-2 (Lab - Double Period)
`;

async function main() {
  const apiKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY is not defined!');
    return;
  }

  const { data: dept } = await supabase
    .from('departments')
    .select('id, short_code')
    .eq('short_code', 'CSE')
    .single();

  if (!dept) {
    console.error('CSE Department not found in DB!');
    return;
  }

  const departmentId = dept.id;
  const deptShortCode = dept.short_code;

  // Insert a mock pdf_ingestions record
  const { data: ingestion, error: insertError } = await supabase
    .from('pdf_ingestions')
    .insert({
      file_path: 'pdf-ingestions/test_mock_timetable_inline.pdf',
      department_id: departmentId,
      status: 'queued',
      file_content: 'MOCK_CONTENT_BASE64'
    })
    .select()
    .single();

  if (insertError || !ingestion) {
    console.error('Failed to insert mock ingestion:', insertError);
    return;
  }

  const ingestionId = ingestion.id;
  console.log(`Mock ingestion created with ID: ${ingestionId}`);

  console.log('Parsing text with Groq...');
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are an academic timetable parser. Return ONLY a valid JSON object with {"rows": [{"day": "Monday"|"Tuesday"|"Wednesday", "period": 1-9, "courseCode": string, "facultyName": string, "roomNumber": string, "section": string, "duration": 1|2}]}. Do not include markdown code fences.'
        },
        {
          role: 'user',
          content: `Parse this timetable:\n\n${sampleTimetableText}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.05
    })
  });

  const resBody = await response.json();
  console.log('Groq API Status:', response.status);
  console.log('Groq API Raw Response:', JSON.stringify(resBody, null, 2));
  const jsonText = resBody.choices?.[0]?.message?.content;
  console.log('Groq LLM Output:', jsonText);

  const parsed = JSON.parse(jsonText);
  const rows = parsed.rows || [];

  // Load lookup data
  const [facultyRes, coursesRes, roomsRes, sectionsRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name').is('deleted_at', null),
    supabase.from('courses').select('id, code, semester, branch').eq('department_id', departmentId).is('deleted_at', null),
    supabase.from('rooms').select('id, room_number').eq('department_id', departmentId).is('deleted_at', null),
    supabase.from('sections').select('id, section_label, branch, semester').eq('department_id', departmentId),
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

  let createdCount = 0;
  let matchedCount = 0;
  let failedCount = 0;
  const errorLog: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    console.log(`Processing row ${i + 1}: ${row.day} P${row.period} ${row.courseCode} ${row.facultyName} ${row.roomNumber}`);
    try {
      // Resolve course
      let course = courses.find((c) => c.code.toUpperCase() === row.courseCode.toUpperCase());
      
      if (!course) {
        const inferredSem = inferSemester(row.section);
        const inferredBr = inferBranch(row.section, deptShortCode);
        console.log(`Course not found: ${row.courseCode}. Auto-creating...`);
        
        const isLab = row.duration > 1 || row.courseCode.toLowerCase().includes('lab') || row.courseCode.toLowerCase().endsWith('l');
        const { data: newCourse } = await supabase
          .from('courses')
          .insert({
            code: row.courseCode.toUpperCase(),
            name: `${row.courseCode} (Auto-created)`,
            credits: isLab ? 1 : 3,
            course_type: isLab ? 'lab' : 'lecture',
            department_id: departmentId,
            branch: inferredBr,
            semester: inferredSem,
          })
          .select()
          .single();

        if (newCourse) {
          course = {
            id: newCourse.id,
            code: newCourse.code,
            semester: newCourse.semester,
            branch: newCourse.branch,
          };
          courses.push(course);
          errorLog.push({ row: i + 1, message: `[INFO] Course ${row.courseCode} was auto-created.` });
        }
      }

      if (!course) {
        console.error('Failed to resolve course');
        failedCount++;
        continue;
      }

      const resolvedCourse = course;

      // Resolve room
      let room = rooms.find((r) => r.room_number.toUpperCase() === row.roomNumber.toUpperCase());
      
      if (!room) {
        console.log(`Room not found: ${row.roomNumber}. Auto-creating...`);
        const isLab = row.roomNumber.toLowerCase().includes('lab') || row.courseCode.toLowerCase().includes('lab');
        const { data: newRoom } = await supabase
          .from('rooms')
          .insert({
            room_number: row.roomNumber,
            department_id: departmentId,
            capacity: 60,
            room_type: isLab ? 'lab' : 'classroom',
          })
          .select()
          .single();

        if (newRoom) {
          room = { id: newRoom.id, room_number: newRoom.room_number };
          rooms.push(room);
          errorLog.push({ row: i + 1, message: `[INFO] Room ${row.roomNumber} was auto-created.` });
        }
      }

      if (!room) {
        console.error('Failed to resolve room');
        failedCount++;
        continue;
      }

      const resolvedRoom = room;

      // Faculty matching
      let facultyId: string | null = null;
      if (row.facultyName && row.facultyName.trim()) {
        const match = fuzzyMatch(row.facultyName, facultyNames);
        if (match) {
          const faculty = facultyList.find((f) => f.full_name === match.match);
          facultyId = faculty?.id || null;
          console.log(`Fuzzy matched faculty: "${row.facultyName}" -> "${match.match}"`);
        } else {
          errorLog.push({ row: i + 1, message: `[WARNING] Faculty name "${row.facultyName}" not matched.` });
        }
      }

      // Section label
      let sectionLabel = row.section.trim();
      if (sectionLabel.length > 1) {
        const match = sectionLabel.match(/\b([A-D])\b/i);
        if (match) {
          sectionLabel = match[1].toUpperCase();
        }
      }

      // Resolve section
      let section = sections.find(
        (s) =>
          s.section_label.toUpperCase() === sectionLabel.toUpperCase() &&
          s.semester === resolvedCourse.semester &&
          s.branch.toUpperCase() === resolvedCourse.branch.toUpperCase()
      );

      if (!section) {
        console.log(`Section not found. Auto-creating...`);
        const { data: newSection } = await supabase
          .from('sections')
          .insert({
            department_id: departmentId,
            branch: resolvedCourse.branch,
            semester: resolvedCourse.semester,
            section_label: sectionLabel.toUpperCase(),
          })
          .select()
          .single();

        if (newSection) {
          section = {
            id: newSection.id,
            section_label: newSection.section_label,
            branch: newSection.branch,
            semester: newSection.semester,
          };
          sections.push(section);
          errorLog.push({ row: i + 1, message: `[INFO] Section ${resolvedCourse.branch} Sem ${resolvedCourse.semester} ${sectionLabel} was auto-created.` });
        }
      }

      if (!section) {
        console.error('Failed to resolve section');
        failedCount++;
        continue;
      }

      const resolvedSection = section;
      const dayOfWeek = DAYS_MAP[row.day];

      if (!dayOfWeek) {
        console.error(`Invalid day: ${row.day}`);
        failedCount++;
        continue;
      }

      // Check existing slot
      const { data: existing } = await supabase
        .from('timetable_entries')
        .select('id')
        .eq('section_id', resolvedSection.id)
        .eq('day_of_week', dayOfWeek)
        .eq('period', row.period)
        .maybeSingle();

      if (existing) {
        console.log(`Updating existing entry for Day ${dayOfWeek} Period ${row.period}`);
        const { error: updateError } = await supabase
          .from('timetable_entries')
          .update({
            course_id: resolvedCourse.id,
            faculty_id: facultyId,
            room_id: resolvedRoom.id,
            slot_duration_minutes: row.duration > 1 ? 110 : 55,
            source_ingestion_id: ingestionId,
          })
          .eq('id', existing.id);

        if (updateError) {
          console.error('Update error:', updateError.message);
          failedCount++;
        } else {
          matchedCount++;
        }
      } else {
        console.log(`Inserting new entry for Day ${dayOfWeek} Period ${row.period}`);
        const { error: insertError } = await supabase
          .from('timetable_entries')
          .insert({
            course_id: resolvedCourse.id,
            faculty_id: facultyId,
            room_id: resolvedRoom.id,
            section_id: resolvedSection.id,
            day_of_week: dayOfWeek,
            period: row.period,
            slot_duration_minutes: row.duration > 1 ? 110 : 55,
            source_ingestion_id: ingestionId,
          });

        if (insertError) {
          console.error('Insert error:', insertError.message);
          failedCount++;
        } else {
          createdCount++;
        }
      }
    } catch (err: any) {
      console.error('Row process error:', err.message);
      failedCount++;
    }
  }

  // Update final status
  const finalStatus = failedCount === rows.length ? 'failed' : failedCount > 0 ? 'partial' : 'done';
  await supabase
    .from('pdf_ingestions')
    .update({
      status: finalStatus,
      rows_total: rows.length,
      rows_created: createdCount,
      rows_matched: matchedCount,
      rows_failed: failedCount,
      error_log: errorLog,
      finished_at: new Date().toISOString(),
    })
    .eq('id', ingestionId);

  console.log(`\n--- Integration complete ---`);
  console.log({
    status: finalStatus,
    total: rows.length,
    created: createdCount,
    matched: matchedCount,
    failed: failedCount,
    errors: errorLog
  });
}

main().catch(console.error);
