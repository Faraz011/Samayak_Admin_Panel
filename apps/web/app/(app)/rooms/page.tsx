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
import type { Room, Department, RoomType } from '@samayak/shared';
import { roomSchema, ROOM_TYPE_CONFIG } from '@samayak/shared';
import {
  DoorOpen, Plus, Search, Pencil, Trash2, AlertTriangle, Filter,
} from 'lucide-react';

export default function RoomsPage() {
  const [rooms, setRooms] = useState<(Room & { department?: Department })[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const [formData, setFormData] = useState({
    room_number: '', department_id: '', capacity: '', room_type: 'classroom' as RoomType,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const [roomsRes, deptsRes] = await Promise.all([
      supabase.from('rooms').select('*, department:departments(*)').is('deleted_at', null).order('room_number'),
      supabase.from('departments').select('*').is('deleted_at', null).order('name'),
    ]);
    if (roomsRes.data) setRooms(roomsRes.data as any);
    if (deptsRes.data) setDepartments(deptsRes.data as Department[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    setFormData({ room_number: '', department_id: departments[0]?.id || '', capacity: '', room_type: 'classroom' });
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (room: Room) => {
    setEditing(room);
    setFormData({
      room_number: room.room_number,
      department_id: room.department_id,
      capacity: room.capacity.toString(),
      room_type: room.room_type,
    });
    setErrors({});
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const parsed = roomSchema.safeParse({ ...formData, capacity: Number(formData.capacity) });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((e) => { fieldErrors[e.path[0] as string] = e.message; });
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    const supabase = createClient();
    if (editing) {
      await supabase.from('rooms').update(parsed.data).eq('id', editing.id);
    } else {
      await supabase.from('rooms').insert(parsed.data);
    }
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from('rooms').update({ deleted_at: new Date().toISOString() }).eq('id', deleting.id);
    setSaving(false);
    setDeleteDialogOpen(false);
    setDeleting(null);
    fetchData();
  };

  const filtered = rooms.filter((r) => {
    const matchesSearch = r.room_number.toLowerCase().includes(search.toLowerCase());
    const matchesDept = filterDept === 'all' || r.department_id === filterDept;
    return matchesSearch && matchesDept;
  });

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
        <Button onClick={openCreate} id="add-room-btn">
          <Plus className="w-4 h-4" /> Add Room
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search rooms…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          icon={<Search className="w-[18px] h-[18px]" />}
          className="max-w-md"
          id="search-rooms"
        />
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-[200px]">
            <Filter className="w-4 h-4 mr-2 text-muted" />
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.short_code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Room Number</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Capacity</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-12 text-muted">
                <DoorOpen className="w-10 h-10 mx-auto mb-2 text-line-2" />
                {search || filterDept !== 'all' ? 'No rooms match your filters' : 'No rooms yet'}
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((room) => {
              const typeConfig = ROOM_TYPE_CONFIG[room.room_type];
              return (
                <TableRow key={room.id}>
                  <TableCell className="font-bold text-ink">{room.room_number}</TableCell>
                  <TableCell>
                    <Badge>{(room.department as any)?.short_code || '—'}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={room.room_type as any}>{typeConfig.label}</Badge>
                  </TableCell>
                  <TableCell>{room.capacity}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(room)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon"
                        onClick={() => { setDeleting(room); setDeleteDialogOpen(true); }}>
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
            <DialogTitle>{editing ? 'Edit Room' : 'Add Room'}</DialogTitle>
            <DialogDescription>{editing ? 'Update room details' : 'Create a new room'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Room Number</Label>
              <Input id="room-number" value={formData.room_number}
                onChange={(e) => setFormData({ ...formData, room_number: e.target.value })}
                placeholder="219" error={!!errors.room_number} className="mt-1.5" />
              {errors.room_number && <p className="text-error text-[12.5px] font-semibold mt-1">{errors.room_number}</p>}
            </div>
            <div>
              <Label>Department</Label>
              <Select value={formData.department_id} onValueChange={(v) => setFormData({ ...formData, department_id: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name} ({d.short_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Room Type</Label>
              <Select value={formData.room_type} onValueChange={(v) => setFormData({ ...formData, room_type: v as RoomType })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="classroom">Classroom</SelectItem>
                  <SelectItem value="lab">Lab</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Capacity</Label>
              <Input id="room-capacity" type="number" value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                placeholder="60" error={!!errors.capacity} className="mt-1.5" />
              {errors.capacity && <p className="text-error text-[12.5px] font-semibold mt-1">{errors.capacity}</p>}
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
              <AlertTriangle className="w-5 h-5 text-error" /> Delete Room
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete room <strong>{deleting?.room_number}</strong>?
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
