'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { Department } from '@samayak/shared';
import { departmentSchema } from '@samayak/shared';
import {
  Building2, Plus, Search, Pencil, Trash2, AlertTriangle, RotateCcw,
} from 'lucide-react';

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<(Department & { rooms_count?: number; courses_count?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);
  const [formData, setFormData] = useState({ name: '', short_code: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchDepartments = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('departments')
      .select('*')
      .is('deleted_at', null)
      .order('name');

    if (data) {
      // Fetch counts
      const withCounts = await Promise.all(
        (data as Department[]).map(async (dept) => {
          const [roomsRes, coursesRes] = await Promise.all([
            supabase.from('rooms').select('id', { count: 'exact' }).eq('department_id', dept.id).is('deleted_at', null),
            supabase.from('courses').select('id', { count: 'exact' }).eq('department_id', dept.id).is('deleted_at', null),
          ]);
          return { ...dept, rooms_count: roomsRes.count || 0, courses_count: coursesRes.count || 0 };
        })
      );
      setDepartments(withCounts);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchDepartments(); }, [fetchDepartments]);

  const openCreate = () => {
    setEditing(null);
    setFormData({ name: '', short_code: '' });
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (dept: Department) => {
    setEditing(dept);
    setFormData({ name: dept.name, short_code: dept.short_code });
    setErrors({});
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const result = departmentSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((e) => { fieldErrors[e.path[0] as string] = e.message; });
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    const supabase = createClient();

    if (editing) {
      await supabase.from('departments').update(result.data).eq('id', editing.id);
    } else {
      await supabase.from('departments').insert(result.data);
    }

    setSaving(false);
    setDialogOpen(false);
    fetchDepartments();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from('departments').update({ deleted_at: new Date().toISOString() }).eq('id', deleting.id);
    setSaving(false);
    setDeleteDialogOpen(false);
    setDeleting(null);
    fetchDepartments();
  };

  const filtered = departments.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.short_code.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px] rounded-card" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Action Bar */}
      <div className="flex justify-end">
        <Button onClick={openCreate} id="add-department-btn">
          <Plus className="w-4 h-4" /> Add Department
        </Button>
      </div>

      {/* Search */}
      <Input
        placeholder="Search departments…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        icon={<Search className="w-[18px] h-[18px]" />}
        className="max-w-md"
        id="search-departments"
      />

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Short Code</TableHead>
            <TableHead>Rooms</TableHead>
            <TableHead>Courses</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-12 text-muted">
                <Building2 className="w-10 h-10 mx-auto mb-2 text-line-2" />
                {search ? 'No departments match your search' : 'No departments yet'}
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((dept) => (
              <TableRow key={dept.id}>
                <TableCell className="font-bold text-ink">{dept.name}</TableCell>
                <TableCell>
                  <Badge>{dept.short_code}</Badge>
                </TableCell>
                <TableCell>{dept.rooms_count}</TableCell>
                <TableCell>{dept.courses_count}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(dept)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setDeleting(dept); setDeleteDialogOpen(true); }}
                    >
                      <Trash2 className="w-4 h-4 text-error" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Department' : 'Add Department'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update department details' : 'Create a new academic department'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="dept-name">Department Name</Label>
              <Input
                id="dept-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Computer Science & Engineering"
                error={!!errors.name}
                className="mt-1.5"
              />
              {errors.name && <p className="text-error text-[12.5px] font-semibold mt-1">{errors.name}</p>}
            </div>
            <div>
              <Label htmlFor="dept-code">Short Code</Label>
              <Input
                id="dept-code"
                value={formData.short_code}
                onChange={(e) => setFormData({ ...formData, short_code: e.target.value.toUpperCase() })}
                placeholder="CSE"
                error={!!errors.short_code}
                className="mt-1.5"
              />
              {errors.short_code && <p className="text-error text-[12.5px] font-semibold mt-1">{errors.short_code}</p>}
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-error" />
              Delete Department
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleting?.name}</strong>?
              {((deleting as any)?.rooms_count > 0 || (deleting as any)?.courses_count > 0) && (
                <span className="block mt-2 text-warning font-semibold">
                  ⚠️ This department has {(deleting as any)?.rooms_count} rooms and {(deleting as any)?.courses_count} courses.
                  They will be orphaned.
                </span>
              )}
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
