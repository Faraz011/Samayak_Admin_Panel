import type { Role, RoomType, CourseType, IngestionStatus } from './types';

// ============================================================
// Samayak Admin Panel — Constants
// ============================================================

export const ROLES: Role[] = ['admin', 'dean', 'hod', 'coordinator', 'professor'];

export const ROLE_CONFIG: Record<Role, { label: string; color: string; bg: string }> = {
  admin:       { label: 'Admin',       color: '#256199', bg: '#e0efff' },
  dean:        { label: 'Dean',        color: '#4f46e5', bg: '#eef2ff' },
  hod:         { label: 'HoD',         color: '#7c3aed', bg: '#f3e8ff' },
  coordinator: { label: 'Coordinator', color: '#0d9488', bg: '#e6fffa' },
  professor:   { label: 'Professor',   color: '#64748b', bg: '#f1f5f9' },
};

export const ROOM_TYPE_CONFIG: Record<RoomType, { label: string; color: string; bg: string }> = {
  classroom: { label: 'Classroom', color: '#256199', bg: '#e0efff' },
  lab:       { label: 'Lab',       color: '#7c3aed', bg: '#f3e8ff' },
  other:     { label: 'Other',     color: '#64748b', bg: '#f1f5f9' },
};

export const COURSE_TYPE_CONFIG: Record<CourseType, { label: string; color: string; bg: string }> = {
  lecture:  { label: 'Lecture',  color: '#256199', bg: '#e0efff' },
  lab:      { label: 'Lab',     color: '#7c3aed', bg: '#f3e8ff' },
  tutorial: { label: 'Tutorial', color: '#0d9488', bg: '#e6fffa' },
};

export const INGESTION_STATUS_CONFIG: Record<IngestionStatus, { label: string; color: string; bg: string; step: number }> = {
  queued:      { label: 'Queued',       color: '#64748b', bg: '#f1f5f9', step: 0 },
  parsing:     { label: 'Parsing',      color: '#f5a524', bg: '#fef9ee', step: 1 },
  integrating: { label: 'Integrating',  color: '#3DA1FF', bg: '#e0efff', step: 2 },
  done:        { label: 'Completed',    color: '#27ae8a', bg: '#e9f7f1', step: 3 },
  failed:      { label: 'Failed',       color: '#ef4655', bg: '#fdecee', step: 3 },
  partial:     { label: 'Partial',      color: '#f5a524', bg: '#fef9ee', step: 3 },
};

export const DAYS_OF_WEEK: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

export const DAYS_SHORT: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export const PERIOD_TIMES: Record<number, string> = {
  1: '8:00',
  2: '9:00',
  3: '10:00',
  4: '11:00',
  5: '12:00',
  6: '1:00',
  7: '2:00',
  8: '3:00',
  9: '4:00',
};

export const BRANCHES = ['CSE', 'AIML', 'MCA', 'MTCS'] as const;

export const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export const PAGE_SIZES = [10, 20, 50, 100] as const;

export const DEFAULT_PAGE_SIZE = 20;

// Demo accounts
export const DEMO_ACCOUNTS = [
  { email: 'admin@samayak.demo',       password: 'admin123',       role: 'admin' as Role,       name: 'Dr. Admin User' },
  { email: 'dean@samayak.demo',        password: 'dean123',        role: 'dean' as Role,        name: 'Prof. Dean Sharma' },
  { email: 'hod@samayak.demo',         password: 'hod123',         role: 'hod' as Role,         name: 'Dr. HoD Verma' },
  { email: 'coordinator@samayak.demo', password: 'coord123',       role: 'coordinator' as Role, name: 'Dr. Coord Patel' },
  { email: 'professor@samayak.demo',   password: 'professor123',   role: 'professor' as Role,   name: 'Prof. Faculty Singh' },
] as const;

// ---- Role-Based Access Control ----

/** Which roles can access each sidebar route */
export const NAV_PERMISSIONS: Record<string, Role[]> = {
  '/dashboard':      ['admin', 'dean', 'hod', 'coordinator', 'professor'],
  '/my-timetable':   ['professor', 'coordinator'],
  '/departments':    ['admin', 'dean', 'hod'],
  '/rooms':          ['admin', 'coordinator'],
  '/courses':        ['admin', 'coordinator', 'hod'],
  '/faculty':        ['admin', 'hod'],
  '/pdf-ingestion':  ['admin', 'coordinator'],
  '/bulk-imports':   ['admin'],
};

/** Nav items that belong in the "elevated / admin" section (shown below divider) */
export const ADMIN_NAV_ROUTES = ['/pdf-ingestion', '/bulk-imports'];

/** Dashboard welcome config per role */
export const ROLE_DASHBOARD_CONFIG: Record<Role, {
  greeting: string;
  subtitle: string;
  actions: { label: string; icon: string; href?: string }[];
}> = {
  professor: {
    greeting: 'Welcome Professor!',
    subtitle: 'Count on me to support you, organize your tasks, and make your workday smoother.',
    actions: [
      { label: 'My Timetable', icon: 'CalendarDays', href: '/my-timetable' },
      { label: 'Request Class Swap', icon: 'ClipboardList' },
      { label: 'Today\'s Focus', icon: 'Target' },
    ],
  },
  coordinator: {
    greeting: 'Welcome Coordinator!',
    subtitle: 'Keep operations running smoothly — fill schedule gaps, track requests, reduce manual work.',
    actions: [
      { label: 'Assign Invigilator Duty', icon: 'Shield' },
      { label: 'Create Follow-up', icon: 'ClipboardList' },
      { label: 'Fill Schedule Gaps', icon: 'CalendarPlus' },
    ],
  },
  hod: {
    greeting: 'Welcome HoD!',
    subtitle: 'Your department at a glance — visibility without micromanaging.',
    actions: [
      { label: 'Schedule Meeting', icon: 'CalendarPlus' },
      { label: 'Department Overview', icon: 'Building2' },
      { label: 'Faculty Workload', icon: 'Users' },
    ],
  },
  dean: {
    greeting: 'Welcome Dean!',
    subtitle: 'Cross-department visibility — see where intervention is needed.',
    actions: [
      { label: 'Department Comparison', icon: 'BarChart3' },
      { label: 'View Issues', icon: 'AlertTriangle' },
    ],
  },
  admin: {
    greeting: 'Welcome Admin!',
    subtitle: 'Monitor institute health — confidence the institution is functioning.',
    actions: [
      { label: 'System Status', icon: 'Activity' },
      { label: 'Full Analytics', icon: 'TrendingUp' },
    ],
  },
};

