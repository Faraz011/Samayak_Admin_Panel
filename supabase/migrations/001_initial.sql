-- ============================================================
-- Samayak Admin Panel — Initial Migration
-- BIT Mesra CSE Spring 2026
-- ============================================================

-- Enums
CREATE TYPE role_enum AS ENUM ('admin','dean','hod','coordinator','professor');
CREATE TYPE room_type_enum AS ENUM ('classroom','lab','other');
CREATE TYPE course_type_enum AS ENUM ('lecture','lab','tutorial');
CREATE TYPE ingestion_status_enum AS ENUM ('queued','parsing','integrating','done','failed','partial');

-- ============================================================
-- Core Tables
-- ============================================================

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_code text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT departments_short_code_unique UNIQUE (short_code)
);

CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  role role_enum NOT NULL DEFAULT 'professor',
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number text NOT NULL,
  department_id uuid REFERENCES departments(id) ON DELETE RESTRICT NOT NULL,
  capacity int NOT NULL CHECK (capacity > 0),
  room_type room_type_enum NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  credits int NOT NULL CHECK (credits >= 0),
  course_type course_type_enum NOT NULL,
  department_id uuid REFERENCES departments(id) NOT NULL,
  branch text NOT NULL,
  semester int NOT NULL CHECK (semester BETWEEN 1 AND 10),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments(id),
  branch text NOT NULL,
  semester int NOT NULL,
  section_label text NOT NULL,
  UNIQUE(department_id, branch, semester, section_label)
);

CREATE TABLE pdf_ingestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path text NOT NULL,
  uploaded_by uuid REFERENCES profiles(id),
  status ingestion_status_enum NOT NULL DEFAULT 'queued',
  department_id uuid REFERENCES departments(id),
  rows_total int DEFAULT 0,
  rows_created int DEFAULT 0,
  rows_matched int DEFAULT 0,
  rows_failed int DEFAULT 0,
  error_log jsonb DEFAULT '[]'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE timetable_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  faculty_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  section_id uuid REFERENCES sections(id) ON DELETE CASCADE NOT NULL,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  period int NOT NULL CHECK (period BETWEEN 1 AND 9),
  slot_duration_minutes int NOT NULL DEFAULT 55,
  source_ingestion_id uuid REFERENCES pdf_ingestions(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE bulk_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path text NOT NULL,
  entity_type text NOT NULL,
  uploaded_by uuid REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'queued',
  rows_total int DEFAULT 0,
  rows_created int DEFAULT 0,
  rows_failed int DEFAULT 0,
  report jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES profiles(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  correlation_id text,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_department ON profiles(department_id);
CREATE INDEX idx_rooms_department ON rooms(department_id);
CREATE INDEX idx_courses_department ON courses(department_id);
CREATE INDEX idx_courses_branch_sem ON courses(branch, semester);
CREATE INDEX idx_timetable_course ON timetable_entries(course_id);
CREATE INDEX idx_timetable_faculty ON timetable_entries(faculty_id);
CREATE INDEX idx_timetable_room ON timetable_entries(room_id);
CREATE INDEX idx_timetable_section ON timetable_entries(section_id);
CREATE INDEX idx_timetable_day_period ON timetable_entries(day_of_week, period);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

-- ============================================================
-- Updated-at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_rooms_updated_at BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_courses_updated_at BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_timetable_updated_at BEFORE UPDATE ON timetable_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Analytics Views
-- ============================================================

CREATE VIEW v_room_utilization AS
SELECT 
  r.id as room_id,
  r.room_number,
  r.department_id,
  t.day_of_week,
  COUNT(t.id) as slots_occupied,
  9 as total_slots,
  ROUND((COUNT(t.id)::numeric / 9 * 100), 1) as utilization_pct
FROM rooms r
LEFT JOIN timetable_entries t ON t.room_id = r.id
WHERE r.deleted_at IS NULL
GROUP BY r.id, r.room_number, r.department_id, t.day_of_week;

CREATE VIEW v_empty_room_probability AS
SELECT 
  t.day_of_week,
  t.period,
  COUNT(t.id) as occupied_rooms,
  (SELECT COUNT(*) FROM rooms WHERE deleted_at IS NULL) - COUNT(t.id) as free_rooms,
  (SELECT COUNT(*) FROM rooms WHERE deleted_at IS NULL) as total_rooms,
  ROUND(
    ((SELECT COUNT(*) FROM rooms WHERE deleted_at IS NULL) - COUNT(t.id))::numeric / 
    NULLIF((SELECT COUNT(*) FROM rooms WHERE deleted_at IS NULL), 0), 3
  ) as probability
FROM timetable_entries t
JOIN rooms r ON t.room_id = r.id
WHERE r.deleted_at IS NULL
GROUP BY t.day_of_week, t.period;

CREATE VIEW v_under_running_courses AS
SELECT 
  c.id as course_id,
  c.code,
  c.name,
  c.credits,
  c.branch,
  c.semester,
  COUNT(t.id) as scheduled_slots,
  c.credits - COUNT(t.id) as gap
FROM courses c
LEFT JOIN timetable_entries t ON t.course_id = c.id
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.code, c.name, c.credits, c.branch, c.semester
HAVING COUNT(t.id) < c.credits;

CREATE VIEW v_avg_empty_room_hours AS
SELECT 
  day_of_week,
  ROUND(AVG((9 - COALESCE(occupied_count, 0)) * 55 / 60.0)::numeric, 2) as avg_empty_hours_per_room
FROM (
  SELECT 
    r.id as room_id,
    t.day_of_week,
    COUNT(t.id) as occupied_count
  FROM rooms r
  LEFT JOIN timetable_entries t ON t.room_id = r.id
  WHERE r.deleted_at IS NULL
  GROUP BY r.id, t.day_of_week
) sub
GROUP BY day_of_week;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_ingestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION public.user_role() RETURNS role_enum AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Profiles
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_admin" ON profiles FOR INSERT TO authenticated
  WITH CHECK (public.user_role() = 'admin');
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE TO authenticated
  USING (public.user_role() = 'admin');
CREATE POLICY "profiles_delete_admin" ON profiles FOR DELETE TO authenticated
  USING (public.user_role() = 'admin');

-- Departments
CREATE POLICY "departments_select_all" ON departments FOR SELECT USING (true);
CREATE POLICY "departments_insert_admin" ON departments FOR INSERT TO authenticated
  WITH CHECK (public.user_role() = 'admin');
CREATE POLICY "departments_update_admin" ON departments FOR UPDATE TO authenticated
  USING (public.user_role() = 'admin');
CREATE POLICY "departments_delete_admin" ON departments FOR DELETE TO authenticated
  USING (public.user_role() = 'admin');

-- Rooms
CREATE POLICY "rooms_select_all" ON rooms FOR SELECT USING (true);
CREATE POLICY "rooms_insert_admin" ON rooms FOR INSERT TO authenticated
  WITH CHECK (public.user_role() = 'admin');
CREATE POLICY "rooms_update_admin" ON rooms FOR UPDATE TO authenticated
  USING (public.user_role() = 'admin');
CREATE POLICY "rooms_delete_admin" ON rooms FOR DELETE TO authenticated
  USING (public.user_role() = 'admin');

-- Courses
CREATE POLICY "courses_select_all" ON courses FOR SELECT USING (true);
CREATE POLICY "courses_insert_admin" ON courses FOR INSERT TO authenticated
  WITH CHECK (public.user_role() = 'admin');
CREATE POLICY "courses_update_admin" ON courses FOR UPDATE TO authenticated
  USING (public.user_role() = 'admin');
CREATE POLICY "courses_delete_admin" ON courses FOR DELETE TO authenticated
  USING (public.user_role() = 'admin');

-- Sections
CREATE POLICY "sections_select_all" ON sections FOR SELECT USING (true);
CREATE POLICY "sections_insert_admin" ON sections FOR INSERT TO authenticated
  WITH CHECK (public.user_role() = 'admin');

-- Timetable entries
CREATE POLICY "timetable_select_all" ON timetable_entries FOR SELECT USING (true);
CREATE POLICY "timetable_insert_admin" ON timetable_entries FOR INSERT TO authenticated
  WITH CHECK (public.user_role() = 'admin');
CREATE POLICY "timetable_update_admin" ON timetable_entries FOR UPDATE TO authenticated
  USING (public.user_role() = 'admin');
CREATE POLICY "timetable_delete_admin" ON timetable_entries FOR DELETE TO authenticated
  USING (public.user_role() = 'admin');

-- PDF Ingestions
CREATE POLICY "pdf_ingestions_select_all" ON pdf_ingestions FOR SELECT USING (true);
CREATE POLICY "pdf_ingestions_insert_admin" ON pdf_ingestions FOR INSERT TO authenticated
  WITH CHECK (public.user_role() = 'admin');
CREATE POLICY "pdf_ingestions_update_admin" ON pdf_ingestions FOR UPDATE TO authenticated
  USING (public.user_role() = 'admin');

-- Bulk Imports
CREATE POLICY "bulk_imports_select_all" ON bulk_imports FOR SELECT USING (true);
CREATE POLICY "bulk_imports_insert_admin" ON bulk_imports FOR INSERT TO authenticated
  WITH CHECK (public.user_role() = 'admin');
CREATE POLICY "bulk_imports_update_admin" ON bulk_imports FOR UPDATE TO authenticated
  USING (public.user_role() = 'admin');

-- Audit logs (read-only for non-admins via select)
CREATE POLICY "audit_select_all" ON audit_logs FOR SELECT USING (true);
CREATE POLICY "audit_insert_any" ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================================
-- Enable Realtime for key tables
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE pdf_ingestions;
ALTER PUBLICATION supabase_realtime ADD TABLE timetable_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE bulk_imports;
