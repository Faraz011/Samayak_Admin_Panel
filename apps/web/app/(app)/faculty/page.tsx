'use client';

import { useEffect, useState, useCallback } from 'react';
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
import type { Profile, Department, Role } from '@samayak/shared';
import { profileSchema, ROLE_CONFIG, ROLES } from '@samayak/shared';
import {
  Users, Plus, Search, Pencil, Trash2, AlertTriangle, RotateCcw,
} from 'lucide-react';

export default function FacultyPage() {
  const [faculty, setFaculty] = useState<(Profile & { department?: Department })[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState<Profile | null>(null);
  const [formData, setFormData] = useState({
    email: '', full_name: '', role: 'professor' as Role, department_id: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    let query = supabase.from('profiles').select('*, department:departments(*)').order('full_name');
    if (!showDeleted) {
      query = query.is('deleted_at', null);
    }
    const [facRes, deptsRes] = await Promise.all([
      query,
      supabase.from('departments').select('*').is('deleted_at', null).order('name'),
    ]);
    if (facRes.data) setFaculty(facRes.data as any);
    if (deptsRes.data) setDepartments(deptsRes.data as Department[]);
    setLoading(false);
  }, [showDeleted]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    setFormData({ email: '', full_name: '', role: 'professor', department_id: departments[0]?.id || '' });
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (prof: Profile) => {
    setEditing(prof);
    setFormData({
      email: prof.email, full_name: prof.full_name,
      role: prof.role, department_id: prof.department_id || '',
    });
    setErrors({});
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const parsed = profileSchema.safeParse({
      ...formData, department_id: formData.department_id || null,
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((e) => { fieldErrors[e.path[0] as string] = e.message; });
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    if (editing) {
      const supabase = createClient();
      const { email, ...updateData } = parsed.data;
      const { error } = await supabase.from('profiles').update(updateData).eq('id', editing.id);
      if (error) {
        alert('Error updating faculty: ' + error.message);
      }
    } else {
      const response = await fetch('/api/faculty', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        const result = await response.json();
        alert('Error creating faculty: ' + (result.error || 'Unknown error'));
      }
    }
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from('profiles').update({ deleted_at: new Date().toISOString() }).eq('id', deleting.id);
    setSaving(false);
    setDeleteDialogOpen(false);
    setDeleting(null);
    fetchData();
  };

  const handleRestore = async (prof: Profile) => {
    const supabase = createClient();
    await supabase.from('profiles').update({ deleted_at: null }).eq('id', prof.id);
    fetchData();
  };

  const filtered = faculty.filter(
    (f) => f.full_name.toLowerCase().includes(search.toLowerCase()) ||
      f.email.toLowerCase().includes(search.toLowerCase())
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
      <div className="flex justify-end gap-3">
        <Button variant={showDeleted ? 'default' : 'ghost'} size="sm"
          onClick={() => setShowDeleted(!showDeleted)}>
          <RotateCcw className="w-4 h-4" /> {showDeleted ? 'Showing Deleted' : 'Show Deleted'}
        </Button>
        <Button onClick={openCreate} id="add-faculty-btn">
          <Plus className="w-4 h-4" /> Add Faculty
        </Button>
      </div>

      <Input placeholder="Search faculty…" value={search}
        onChange={(e) => setSearch(e.target.value)}
        icon={<Search className="w-[18px] h-[18px]" />}
        className="max-w-md" id="search-faculty" />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Department</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-12 text-muted">
                <Users className="w-10 h-10 mx-auto mb-2 text-line-2" />
                No faculty members found
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((prof) => {
              const roleConfig = ROLE_CONFIG[prof.role];
              const isDeleted = !!prof.deleted_at;
              return (
                <TableRow key={prof.id} className={isDeleted ? 'opacity-50' : ''}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-[10px] flex items-center justify-center text-white text-[11px] font-extrabold flex-shrink-0"
                        style={{ background: roleConfig.color }}
                      >
                        {prof.full_name.split(' ').map(w => w[0]).join('').substring(0, 2)}
                      </div>
                      <span className="font-bold text-ink">{prof.full_name}</span>
                      {isDeleted && <Badge variant="error">Deleted</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted">{prof.email}</TableCell>
                  <TableCell>
                    <Badge variant={prof.role as any}>{roleConfig.label}</Badge>
                  </TableCell>
                  <TableCell>
                    {(prof.department as any)?.short_code || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {isDeleted ? (
                        <Button variant="ghost" size="sm" onClick={() => handleRestore(prof)}>
                          <RotateCcw className="w-4 h-4 text-success" /> Restore
                        </Button>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(prof)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon"
                            onClick={() => { setDeleting(prof); setDeleteDialogOpen(true); }}>
                            <Trash2 className="w-4 h-4 text-error" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Faculty' : 'Add Faculty'}</DialogTitle>
            <DialogDescription>{editing ? 'Update faculty details' : 'Add a new faculty member'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Full Name</Label>
              <Input value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="Dr. John Doe" error={!!errors.full_name} className="mt-1.5" />
            </div>
            {!editing && (
              <div>
                <Label>Email</Label>
                <Input value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@samayak.demo" error={!!errors.email} className="mt-1.5" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Role</Label>
                <Select value={formData.role}
                  onValueChange={(v) => setFormData({ ...formData, role: v as Role })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_CONFIG[r].label}</SelectItem>
                    ))}
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
              <AlertTriangle className="w-5 h-5 text-error" /> Delete Faculty
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleting?.full_name}</strong>?
              This is a soft delete — you can restore them later.
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
