'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { Course, Department, CourseType } from '@samayak/shared';
import { courseSchema, COURSE_TYPE_CONFIG, BRANCHES, SEMESTERS } from '@samayak/shared';
import {
  BookOpen, Plus, Search, Pencil, Trash2, AlertTriangle, AlertCircle,
} from 'lucide-react';

function CoursesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [courses, setCourses] = useState<Course[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState(searchParams.get('branch') || 'CSE');
  const [semester, setSemester] = useState(searchParams.get('semester') || '6');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [deleting, setDeleting] = useState<Course | null>(null);
  const [formData, setFormData] = useState({
    code: '', name: '', credits: '', course_type: 'lecture' as CourseType,
    department_id: '', branch: 'CSE', semester: '6',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Persist filters in URL
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('branch', branch);
    params.set('semester', semester);
    router.replace(`/courses?${params.toString()}`, { scroll: false });
  }, [branch, semester, router]);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const [coursesRes, deptsRes] = await Promise.all([
      supabase.from('courses').select('*')
        .is('deleted_at', null)
        .eq('branch', branch)
        .eq('semester', Number(semester))
        .order('code'),
      supabase.from('departments').select('*').is('deleted_at', null).order('name'),
    ]);
    if (coursesRes.data) setCourses(coursesRes.data as Course[]);
    if (deptsRes.data) setDepartments(deptsRes.data as Department[]);
    setLoading(false);
  }, [branch, semester]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    setFormData({
      code: '', name: '', credits: '', course_type: 'lecture',
      department_id: departments[0]?.id || '', branch, semester,
    });
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (course: Course) => {
    setEditing(course);
    setFormData({
      code: course.code, name: course.name, credits: course.credits.toString(),
      course_type: course.course_type, department_id: course.department_id,
      branch: course.branch, semester: course.semester.toString(),
    });
    setErrors({});
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const parsed = courseSchema.safeParse({
      ...formData, credits: Number(formData.credits), semester: Number(formData.semester),
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((e) => { fieldErrors[e.path[0] as string] = e.message; });
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    const supabase = createClient();
    if (editing) {
      await supabase.from('courses').update(parsed.data).eq('id', editing.id);
    } else {
      await supabase.from('courses').insert(parsed.data);
    }
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from('courses').update({ deleted_at: new Date().toISOString() }).eq('id', deleting.id);
    setSaving(false);
    setDeleteDialogOpen(false);
    setDeleting(null);
    fetchData();
  };

  const filtered = courses.filter(
    (c) => c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-[400px] rounded-card" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Action Bar */}
      <div className="flex justify-end">
        <Button onClick={openCreate} id="add-course-btn">
          <Plus className="w-4 h-4" /> Add Course
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input placeholder="Search courses…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          icon={<Search className="w-[18px] h-[18px]" />}
          className="max-w-md" id="search-courses" />
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            {BRANCHES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={semester} onValueChange={setSemester}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Semester" /></SelectTrigger>
          <SelectContent>
            {SEMESTERS.map((s) => <SelectItem key={s} value={s.toString()}>Semester {s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Credits</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-12 text-muted">
                <BookOpen className="w-10 h-10 mx-auto mb-2 text-line-2" />
                No courses found for {branch} Semester {semester}
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((course) => {
              const typeConfig = COURSE_TYPE_CONFIG[course.course_type];
              return (
                <TableRow key={course.id}>
                  <TableCell className="font-bold text-ink">{course.code}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {course.name}
                      {course.credits === 0 && (
                        <Badge variant="zero" className="flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Zero Credit
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{course.credits}</TableCell>
                  <TableCell>
                    <Badge variant={course.course_type as any}>{typeConfig.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(course)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon"
                        onClick={() => { setDeleting(course); setDeleteDialogOpen(true); }}>
                        <Trash2 className="w-4 h-4 text-error" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Course' : 'Add Course'}</DialogTitle>
            <DialogDescription>{editing ? 'Update course details' : 'Create a new course'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Course Code</Label>
                <Input id="course-code" value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="CS301" error={!!errors.code} className="mt-1.5" />
              </div>
              <div>
                <Label>Credits</Label>
                <Input id="course-credits" type="number" value={formData.credits}
                  onChange={(e) => setFormData({ ...formData, credits: e.target.value })}
                  placeholder="4" error={!!errors.credits} className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label>Course Name</Label>
              <Input id="course-name" value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Compiler Design" error={!!errors.name} className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={formData.course_type}
                  onValueChange={(v) => setFormData({ ...formData, course_type: v as CourseType })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lecture">Lecture</SelectItem>
                    <SelectItem value="lab">Lab</SelectItem>
                    <SelectItem value="tutorial">Tutorial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Department</Label>
                <Select value={formData.department_id}
                  onValueChange={(v) => setFormData({ ...formData, department_id: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.short_code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Branch</Label>
                <Select value={formData.branch}
                  onValueChange={(v) => setFormData({ ...formData, branch: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BRANCHES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Semester</Label>
                <Select value={formData.semester}
                  onValueChange={(v) => setFormData({ ...formData, semester: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEMESTERS.map((s) => (
                      <SelectItem key={s} value={s.toString()}>Sem {s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-error" /> Delete Course
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleting?.code} — {deleting?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CoursesPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-[400px] rounded-card" />
      </div>
    }>
      <CoursesPageContent />
    </Suspense>
  );
}
