import { z } from 'zod';

// ============================================================
// Samayak Admin Panel — Zod Validation Schemas
// ============================================================

export const departmentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  short_code: z.string().min(2, 'Short code must be at least 2 characters').max(10)
    .regex(/^[A-Z0-9]+$/, 'Short code must be uppercase letters/numbers only'),
});

export const roomSchema = z.object({
  room_number: z.string().min(1, 'Room number is required').max(20),
  department_id: z.string().uuid('Invalid department'),
  capacity: z.number().int().min(1, 'Capacity must be at least 1').max(500),
  room_type: z.enum(['classroom', 'lab', 'other']),
});

export const courseSchema = z.object({
  code: z.string().min(2, 'Course code is required').max(20),
  name: z.string().min(2, 'Course name is required').max(200),
  credits: z.number().int().min(0, 'Credits cannot be negative').max(12),
  course_type: z.enum(['lecture', 'lab', 'tutorial']),
  department_id: z.string().uuid('Invalid department'),
  branch: z.string().min(1, 'Branch is required').max(50),
  semester: z.number().int().min(1).max(10),
});

export const profileSchema = z.object({
  email: z.string().email('Invalid email address'),
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  role: z.enum(['admin', 'dean', 'hod', 'coordinator', 'professor']),
  department_id: z.string().uuid('Invalid department').nullable().optional(),
});

export const sectionSchema = z.object({
  department_id: z.string().uuid('Invalid department'),
  branch: z.string().min(1, 'Branch is required'),
  semester: z.number().int().min(1).max(10),
  section_label: z.string().min(1, 'Section label is required').max(5),
});

export const timetableEntrySchema = z.object({
  course_id: z.string().uuid(),
  faculty_id: z.string().uuid().nullable().optional(),
  room_id: z.string().uuid().nullable().optional(),
  section_id: z.string().uuid(),
  day_of_week: z.number().int().min(1).max(7),
  period: z.number().int().min(1).max(9),
  slot_duration_minutes: z.number().int().default(55),
});

export const pdfIngestionSchema = z.object({
  department_id: z.string().uuid('Please select a department'),
});

export const bulkImportSchema = z.object({
  entity_type: z.enum(['departments', 'rooms', 'courses', 'faculty']),
});

// Search/filter schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const courseFilterSchema = z.object({
  branch: z.string().min(1, 'Branch is required'),
  semester: z.coerce.number().int().min(1).max(10),
});

// Inferred types
export type DepartmentInput = z.infer<typeof departmentSchema>;
export type RoomInput = z.infer<typeof roomSchema>;
export type CourseInput = z.infer<typeof courseSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type SectionInput = z.infer<typeof sectionSchema>;
export type TimetableEntryInput = z.infer<typeof timetableEntrySchema>;
export type PdfIngestionInput = z.infer<typeof pdfIngestionSchema>;
export type BulkImportInput = z.infer<typeof bulkImportSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type CourseFilterInput = z.infer<typeof courseFilterSchema>;
