'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { BulkImport } from '@samayak/shared';
import {
  Upload, FileUp, ArrowRight, Loader2, CheckCircle2, XCircle,
  FileSpreadsheet, Download,
} from 'lucide-react';

const ENTITY_TYPES = [
  { value: 'departments', label: 'Departments' },
  { value: 'rooms', label: 'Rooms' },
  { value: 'courses', label: 'Courses' },
  { value: 'faculty', label: 'Faculty' },
];

export default function BulkImportsPage() {
  const [imports, setImports] = useState<BulkImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [entityType, setEntityType] = useState('departments');
  const [dragOver, setDragOver] = useState(false);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('bulk_imports')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setImports(data as BulkImport[]);
    setLoading(false);
  }, []);

  const handleDownloadTemplate = () => {
    let headers = '';
    let sampleData = '';
    let filename = '';

    switch (entityType) {
      case 'departments':
        headers = 'name,short_code';
        sampleData = 'Computer Science & Engineering,CSE\nInformation Technology,IT';
        filename = 'departments_template.csv';
        break;
      case 'rooms':
        headers = 'room_number,department,capacity,room_type';
        sampleData = '219,CSE,60,classroom\nLab-1,CSE,40,lab';
        filename = 'rooms_template.csv';
        break;
      case 'courses':
        headers = 'code,name,credits,course_type,department,branch,semester';
        sampleData = 'CS301,Compiler Design,4,lecture,CSE,CSE,6\nCS351,Compiler Design Lab,2,lab,CSE,CSE,6';
        filename = 'courses_template.csv';
        break;
      case 'faculty':
        headers = 'email,full_name,role,department,password';
        sampleData = 'sharma.r@samayak.demo,Dr. Rakesh Sharma,professor,CSE,faculty123\nkumar.a@samayak.demo,Prof. Amit Kumar,professor,CSE,faculty123';
        filename = 'faculty_template.csv';
        break;
      default:
        return;
    }

    const csvContent = `${headers}\n${sampleData}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    fetchData();

    const supabase = createClient();
    const channel = supabase
      .channel('bulk-import-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bulk_imports' }, () => {
        fetchData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const handleUpload = async (file: File) => {
    setUploading(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const filePath = `bulk-imports/${Date.now()}_${file.name}`;

      // Read file as base64 string
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];

        // Create bulk import record with file_content
        const { error: insertError } = await supabase.from('bulk_imports').insert({
          file_path: filePath,
          entity_type: entityType,
          uploaded_by: user?.id,
          status: 'queued',
          file_content: base64Data, // Save base64 data directly
        });

        if (insertError) {
          console.error('Failed to create import record:', insertError);
          alert('Failed to save import record: ' + insertError.message);
          setUploading(false);
          return;
        }

        // Trigger BullMQ job via API
        const response = await fetch('/api/bulk-imports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_path: filePath, entity_type: entityType }),
        });

        if (!response.ok) {
          const result = await response.json();
          console.error('Queue error:', result.error);
        }

        fetchData();
        setUploading(false);
      };

      reader.onerror = () => {
        alert('Failed to read the file.');
        setUploading(false);
      };

      reader.readAsDataURL(file);
      return;
    } catch (err: any) {
      console.error('Upload failed:', err);
      alert('Upload failed: ' + err.message);
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'queued': return <Badge variant="muted">Queued</Badge>;
      case 'processing': return <Badge variant="info"><Loader2 className="w-3 h-3 animate-spin mr-1" />Processing</Badge>;
      case 'done': return <Badge variant="success">Completed</Badge>;
      case 'failed': return <Badge variant="error">Failed</Badge>;
      default: return <Badge variant="muted">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px] rounded-card" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Upload Area */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_2fr] gap-6 items-start">
            <div>
              <Label className="mb-1.5 block">Entity Type</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[12.5px] text-muted font-medium mt-2">
                Select the type of data you&apos;re importing
              </p>

              {/* Template Download */}
              <div className="mt-4">
                <Button variant="ghost" size="sm" className="text-[12.5px]" onClick={handleDownloadTemplate}>
                  <Download className="w-3.5 h-3.5" /> Download Template
                </Button>
              </div>
            </div>

            <div className="hidden md:flex items-center justify-center">
              <ArrowRight className="w-5 h-5 text-line-2" />
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-card p-8 text-center transition-all duration-200 cursor-pointer ${
                dragOver ? 'border-brand-blue bg-[#eef5fd]' : 'border-line-2 hover:border-brand-blue/50'
              }`}
              onClick={() => document.getElementById('bulk-file-input')?.click()}
            >
              <input
                id="bulk-file-input"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileInput}
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-brand-blue animate-spin" />
                  <p className="font-bold text-ink">Processing import…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-[16px] bg-[#eef5fd] flex items-center justify-center">
                    <FileSpreadsheet className="w-7 h-7 text-brand-blue" />
                  </div>
                  <div>
                    <p className="font-bold text-ink text-[15px]">Drop CSV/Excel file here</p>
                    <p className="text-[13px] text-muted font-medium mt-1">
                      Supports .csv, .xlsx, .xls formats with preview and validation
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Import History */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-[16px] font-extrabold text-ink mb-4">Import History</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Entity Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Rows Created</TableHead>
                <TableHead>Rows Failed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted">
                    <Upload className="w-10 h-10 mx-auto mb-2 text-line-2" />
                    No imports yet
                  </TableCell>
                </TableRow>
              ) : (
                imports.map((imp) => (
                  <TableRow key={imp.id}>
                    <TableCell className="font-bold text-ink max-w-[200px] truncate">
                      {imp.file_path.split('/').pop()}
                    </TableCell>
                    <TableCell><Badge>{imp.entity_type}</Badge></TableCell>
                    <TableCell>{getStatusBadge(imp.status)}</TableCell>
                    <TableCell className="text-muted text-[13px]">
                      {new Date(imp.created_at).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>
                      <span className="text-success font-bold">{imp.rows_created}</span>
                    </TableCell>
                    <TableCell>
                      <span className={`font-bold ${imp.rows_failed > 0 ? 'text-error' : 'text-muted'}`}>
                        {imp.rows_failed}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
