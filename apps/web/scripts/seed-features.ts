// @ts-ignore
import { loadEnvConfig } from '@next/env';
import path from 'path';

// Load environment variables from .env.local
loadEnvConfig(path.resolve(__dirname, '..'));

// Shim WebSocket for Node < 22 to prevent Supabase Realtime client error
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = class {};
}

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://urgtpxnrutgeiyuxkawx.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  console.log('🌱 Seeding Samayak Admin Panel User Features…\n');

  // 1. Get CSE Department
  const { data: cseDept } = await supabase
    .from('departments')
    .select('id')
    .eq('short_code', 'CSE')
    .single();

  const departmentId = cseDept?.id || null;
  if (!departmentId) {
    console.error('❌ CSE department not found. Make sure to run basic seed first!');
    return;
  }

  // 2. Get demo users
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, role');

  const professor = profiles?.find((p) => p.email === 'professor@samayak.demo');
  const coordinator = profiles?.find((p) => p.email === 'coordinator@samayak.demo');
  const hod = profiles?.find((p) => p.email === 'hod@samayak.demo');
  const additionalFaculty = profiles?.filter((p) => p.role === 'professor' && p.email !== 'professor@samayak.demo') || [];

  if (!professor || !coordinator || !hod) {
    console.error('❌ Demo profiles not found. Run basic seed first!');
    return;
  }

  // Clear existing entries to prevent duplicates and make it repeatable
  console.log('  Clearing old feature data…');
  await Promise.all([
    supabase.from('tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('reminders').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('meetings').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('invigilator_duties').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('swap_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('faculty_followups').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('timetable_conflicts').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
  ]);

  // 3. Seed Tasks for Professor
  console.log('  Seeding Tasks for Professor…');
  await supabase.from('tasks').insert([
    { user_id: professor.id, text: 'Confirm invigilation duty for room 203', completed: false },
    { user_id: professor.id, text: 'Submit midterm grades for CS301', completed: false },
    { user_id: professor.id, text: 'Take attendance for Period 2 CSE class', completed: true },
  ]);

  // 4. Seed Reminders for Professor
  console.log('  Seeding Reminders for Professor…');
  await supabase.from('reminders').insert([
    { user_id: professor.id, text: 'Faculty meeting with Dean', time: 'Today, 2:30 PM' },
    { user_id: professor.id, text: 'Upload Syllabus for CSE Sem 6', time: 'Tomorrow' },
  ]);

  // 5. Seed Meetings for Department
  console.log('  Seeding Department Meetings…');
  await supabase.from('meetings').insert([
    { title: 'Professors Meet', time_description: 'Today at 2:30 pm · Online', url: 'https://meet.google.com/abc-defg-hij', department_id: departmentId },
    { title: 'Curriculum Review Committee', time_description: 'Friday at 11:00 am · Conference Room', url: null, department_id: departmentId },
  ]);

  // 6. Seed Invigilator Duties for Professor
  console.log('  Seeding Invigilator Duties…');
  const { data: rooms } = await supabase.from('rooms').select('id, room_number').limit(2);
  const dutyRoomId = rooms?.[0]?.id || null;

  await supabase.from('invigilator_duties').insert([
    { faculty_id: professor.id, room_id: dutyRoomId, time_description: '10:00 am - 12:00 pm', acknowledged: false },
  ]);

  // 7. Seed Swap Requests for HOD
  console.log('  Seeding Swap Requests…');
  if (additionalFaculty.length > 0) {
    await supabase.from('swap_requests').insert([
      { faculty_id: additionalFaculty[0].id, details: 'Monday Period 2 → Tuesday Period 4 (Course CS302)', status: 'Pending Approval' },
      { faculty_id: additionalFaculty[1 % additionalFaculty.length].id, details: 'Wednesday Period 5 → Thursday Period 1 (Course CS305)', status: 'Approved' },
    ]);
  } else {
    await supabase.from('swap_requests').insert([
      { faculty_id: professor.id, details: 'Monday Period 2 → Tuesday Period 4 (Course CS302)', status: 'Pending Approval' },
    ]);
  }

  // 8. Seed Faculty Follow-ups for Coordinator
  console.log('  Seeding Faculty Follow-ups…');
  if (additionalFaculty.length >= 2) {
    await supabase.from('faculty_followups').insert([
      { faculty_id: additionalFaculty[0].id, detail: 'Missing Wednesday period 3 schedule', status: 'Pending Response' },
      { faculty_id: additionalFaculty[1].id, detail: 'Verify slot allocation for CS302', status: 'Pending Response' },
      { faculty_id: professor.id, detail: 'Timetable verification request', status: 'Confirmed' },
    ]);
  } else {
    await supabase.from('faculty_followups').insert([
      { faculty_id: professor.id, detail: 'Missing Wednesday period 3 schedule', status: 'Pending Response' },
    ]);
  }

  // 9. Seed Timetable Conflicts for Coordinator
  console.log('  Seeding Timetable Conflicts…');
  const { data: allRooms } = await supabase.from('rooms').select('id, room_number');
  const clashRoom = allRooms?.find((r) => r.room_number === '101') || allRooms?.[0];

  if (clashRoom) {
    await supabase.from('timetable_conflicts').insert([
      { room_id: clashRoom.id, day_of_week: 1, period: 2, details: 'CS301 (CSE) & ME201 (ME) Double Booked', resolved: false },
    ]);
  }

  console.log('\n✅ User features seeding complete!\n');
}

seed().catch(console.error);
