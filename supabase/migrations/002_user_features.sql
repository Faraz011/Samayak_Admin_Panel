-- Enums for new tables
CREATE TYPE swap_status_enum AS ENUM ('Pending Approval', 'Approved', 'Rejected');
CREATE TYPE followup_status_enum AS ENUM ('Pending Response', 'Confirmed', 'Nudged');

-- 1. Tasks Table (Professor Checklist)
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 2. Reminders Table (Professor Reminders)
CREATE TABLE reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text text NOT NULL,
  time text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3. Meetings Table (Professor / Dept Meetings)
CREATE TABLE meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  time_description text NOT NULL,
  url text,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- 4. Invigilator Duties Table (Professor Duties)
CREATE TABLE invigilator_duties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  time_description text NOT NULL,
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 5. Swap Requests Table (HOD Approvals)
CREATE TABLE swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  details text NOT NULL,
  status swap_status_enum NOT NULL DEFAULT 'Pending Approval',
  created_at timestamptz DEFAULT now()
);

-- 6. Faculty Follow-ups Table (Coordinator follow-ups)
CREATE TABLE faculty_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  detail text NOT NULL,
  status followup_status_enum NOT NULL DEFAULT 'Pending Response',
  created_at timestamptz DEFAULT now()
);

-- 7. Timetable Conflicts Table (Coordinator Clashes)
CREATE TABLE timetable_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  period int NOT NULL CHECK (period BETWEEN 1 AND 9),
  details text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolution_details text,
  created_at timestamptz DEFAULT now()
);

-- RLS Enforcement
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE invigilator_duties ENABLE ROW LEVEL SECURITY;
ALTER TABLE swap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE faculty_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_conflicts ENABLE ROW LEVEL SECURITY;

-- 1. Tasks Policies
CREATE POLICY "tasks_select_own" ON tasks FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "tasks_insert_own" ON tasks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tasks_update_own" ON tasks FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "tasks_delete_own" ON tasks FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 2. Reminders Policies
CREATE POLICY "reminders_select_own" ON reminders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "reminders_insert_own" ON reminders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reminders_update_own" ON reminders FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "reminders_delete_own" ON reminders FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 3. Meetings Policies
CREATE POLICY "meetings_select_all" ON meetings FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "meetings_write_admin_coordinator" ON meetings FOR ALL TO authenticated
  USING (public.user_role() IN ('admin', 'coordinator', 'hod'));

-- 4. Invigilator Duties Policies
CREATE POLICY "duties_select_own_or_elevated" ON invigilator_duties FOR SELECT TO authenticated
  USING (auth.uid() = faculty_id OR public.user_role() IN ('admin', 'coordinator', 'hod'));
CREATE POLICY "duties_update_own_or_elevated" ON invigilator_duties FOR UPDATE TO authenticated
  USING (auth.uid() = faculty_id OR public.user_role() IN ('admin', 'coordinator', 'hod'));
CREATE POLICY "duties_insert_elevated" ON invigilator_duties FOR INSERT TO authenticated
  WITH CHECK (public.user_role() IN ('admin', 'coordinator', 'hod'));

-- 5. Swap Requests Policies
CREATE POLICY "swap_select_own_or_hod_admin" ON swap_requests FOR SELECT TO authenticated
  USING (auth.uid() = faculty_id OR public.user_role() IN ('admin', 'hod'));
CREATE POLICY "swap_insert_own" ON swap_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = faculty_id);
CREATE POLICY "swap_update_hod_admin" ON swap_requests FOR UPDATE TO authenticated
  USING (public.user_role() IN ('admin', 'hod'));

-- 6. Faculty Follow-ups Policies
CREATE POLICY "followups_select_all" ON faculty_followups FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "followups_all_coordinator_admin" ON faculty_followups FOR ALL TO authenticated
  USING (public.user_role() IN ('admin', 'coordinator'));

-- 7. Timetable Conflicts Policies
CREATE POLICY "conflicts_select_all" ON timetable_conflicts FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "conflicts_all_coordinator_admin" ON timetable_conflicts FOR ALL TO authenticated
  USING (public.user_role() IN ('admin', 'coordinator'));

-- Enable Realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE reminders;
ALTER PUBLICATION supabase_realtime ADD TABLE meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE invigilator_duties;
ALTER PUBLICATION supabase_realtime ADD TABLE swap_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE faculty_followups;
ALTER PUBLICATION supabase_realtime ADD TABLE timetable_conflicts;
