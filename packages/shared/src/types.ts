// ============================================================
// Samayak Admin Panel — Shared Types
// ============================================================

export type Role = 'admin' | 'dean' | 'hod' | 'coordinator' | 'professor';
export type RoomType = 'classroom' | 'lab' | 'other';
export type CourseType = 'lecture' | 'lab' | 'tutorial';
export type IngestionStatus = 'queued' | 'parsing' | 'integrating' | 'done' | 'failed' | 'partial';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  department_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  name: string;
  short_code: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Room {
  id: string;
  room_number: string;
  department_id: string;
  capacity: number;
  room_type: RoomType;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  credits: number;
  course_type: CourseType;
  department_id: string;
  branch: string;
  semester: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Section {
  id: string;
  department_id: string;
  branch: string;
  semester: number;
  section_label: string;
}

export interface TimetableEntry {
  id: string;
  course_id: string;
  faculty_id: string | null;
  room_id: string | null;
  section_id: string;
  day_of_week: number;
  period: number;
  slot_duration_minutes: number;
  source_ingestion_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PdfIngestion {
  id: string;
  file_path: string;
  uploaded_by: string | null;
  status: IngestionStatus;
  department_id: string | null;
  rows_total: number;
  rows_created: number;
  rows_matched: number;
  rows_failed: number;
  error_log: Array<{ row: number; message: string; data?: unknown }>;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface BulkImport {
  id: string;
  file_path: string;
  entity_type: string;
  uploaded_by: string | null;
  status: string;
  rows_total: number;
  rows_created: number;
  rows_failed: number;
  report: Array<{ row: number; status: 'created' | 'skipped' | 'failed'; message?: string }>;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  correlation_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

// Analytics view types
export interface RoomUtilization {
  room_id: string;
  room_number: string;
  department_id: string;
  day_of_week: number;
  slots_occupied: number;
  total_slots: number;
  utilization_pct: number;
}

export interface EmptyRoomProbability {
  day_of_week: number;
  period: number;
  occupied_rooms: number;
  free_rooms: number;
  total_rooms: number;
  probability: number;
}

export interface UnderRunningCourse {
  course_id: string;
  code: string;
  name: string;
  credits: number;
  branch: string;
  semester: number;
  scheduled_slots: number;
  gap: number;
}

export interface AvgEmptyRoomHours {
  day_of_week: number;
  avg_empty_hours_per_room: number;
}

// API types
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  meta?: {
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
