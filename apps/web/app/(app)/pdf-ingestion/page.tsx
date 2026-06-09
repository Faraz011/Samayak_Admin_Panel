'use client';

import React, { useEffect, useState, useCallback } from 'react';
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
import type { PdfIngestion, Department } from '@samayak/shared';
import { INGESTION_STATUS_CONFIG } from '@samayak/shared';
import {
  FileText, Upload, CheckCircle2, XCircle, AlertCircle, Clock,
  Loader2, ArrowRight, FileUp, ChevronDown, ChevronUp, RefreshCw,
} from 'lucide-react';

export default function PdfIngestionPage() {
  const [ingestions, setIngestions] = useState<(PdfIngestion & { department?: Department })[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [dragOver, setDragOver] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const [ingRes, deptsRes] = await Promise.all([
      supabase.from('pdf_ingestions').select('*, department:departments(*)').order('created_at', { ascending: false }),
      supabase.from('departments').select('*').is('deleted_at', null).order('name'),
    ]);
    if (ingRes.data) setIngestions(ingRes.data as any);
    if (deptsRes.data) {
      setDepartments(deptsRes.data as Department[]);
      if (!selectedDept && deptsRes.data.length > 0) setSelectedDept(deptsRes.data[0].id);
    }
    setLoading(false);
  }, [selectedDept]);

  useEffect(() => {
    fetchData();

    // Realtime subscription for status updates
    const supabase = createClient();
    const channel = supabase
      .channel('pdf-ingestion-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pdf_ingestions' }, () => {
        fetchData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRetry = async (ingestionId: string) => {
    try {
      const supabase = createClient();
      
      // Update local state to queued so user sees immediate feedback
      setIngestions((prev) =>
        prev.map((ing) =>
          ing.id === ingestionId ? { ...ing, status: 'queued', error_log: [] } : ing
        )
      );

      // Reset record status and error log in database
      const { error: resetError } = await supabase
        .from('pdf_ingestions')
        .update({ status: 'queued', error_log: [] })
        .eq('id', ingestionId);

      if (resetError) {
        throw resetError;
      }

      // Call the process endpoint in a non-blocking/background way
      fetch('/api/pdf-ingestions/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingestion_id: ingestionId }),
      }).catch((err) => {
        console.error('Failed to trigger background retry:', err);
      });

    } catch (err: any) {
      console.error('Retry error:', err);
      alert('Failed to retry ingestion: ' + err.message);
      fetchData();
    }
  };

  const handleUpload = async (file: File) => {
    if (!selectedDept) return;
    setUploading(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const filePath = `pdf-ingestions/${Date.now()}_${file.name}`;

      // Read file as base64 string
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];

        // Create Ingestion record with file_content, returning the inserted row
        const { data: insertedData, error: insertError } = await supabase
          .from('pdf_ingestions')
          .insert({
            file_path: filePath,
            uploaded_by: user?.id,
            department_id: selectedDept,
            status: 'queued',
            file_content: base64Data, // Save base64 data directly
          })
          .select()
          .single();

        if (insertError || !insertedData) {
          console.error('Failed to create ingestion record:', insertError);
          alert('Failed to save ingestion record: ' + (insertError?.message || 'Unknown error'));
          setUploading(false);
          return;
        }

        // Trigger the process route inline in a background way
        fetch('/api/pdf-ingestions/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ingestion_id: insertedData.id }),
        }).catch((err) => {
          console.error('Failed to trigger inline background processor:', err);
        });

        // Set uploading to false immediately since background processing handles the rest
        setUploading(false);
        fetchData();
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
    if (file && file.type === 'application/pdf') {
      handleUpload(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued': return <Clock className="w-4 h-4" />;
      case 'parsing': return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'integrating': return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'done': return <CheckCircle2 className="w-4 h-4" />;
      case 'failed': return <XCircle className="w-4 h-4" />;
      case 'partial': return <AlertCircle className="w-4 h-4" />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px] rounded-card" />
        <Skeleton className="h-[300px] rounded-card" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Upload Area */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_2fr] gap-6 items-start">
            {/* Department Selector */}
            <div>
              <Label className="mb-1.5 block">Target Department</Label>
              <Select value={selectedDept} onValueChange={setSelectedDept}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name} ({d.short_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[12.5px] text-muted font-medium mt-2">
                Select the department this timetable belongs to
              </p>
            </div>

            <div className="hidden md:flex items-center justify-center">
              <ArrowRight className="w-5 h-5 text-line-2" />
            </div>

            {/* Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-card p-8 text-center transition-all duration-200 cursor-pointer ${
                dragOver
                  ? 'border-brand-blue bg-[#eef5fd]'
                  : 'border-line-2 hover:border-brand-blue/50 hover:bg-[#f7fafd]'
              }`}
              onClick={() => document.getElementById('pdf-file-input')?.click()}
            >
              <input
                id="pdf-file-input"
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleFileInput}
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-brand-blue animate-spin" />
                  <p className="font-bold text-ink">Uploading and queueing…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-[16px] bg-[#eef5fd] flex items-center justify-center">
                    <FileUp className="w-7 h-7 text-brand-blue" />
                  </div>
                  <div>
                    <p className="font-bold text-ink text-[15px]">Drop PDF here or click to upload</p>
                    <p className="text-[13px] text-muted font-medium mt-1">
                      Supports BIT Mesra timetable format (merged cells, multi-period labs)
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pipeline Steps */}
          <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
            {['Upload', 'Queue', 'Parse PDF', 'Fuzzy Match', 'Integrate', 'Report'].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <span className="text-[11.5px] font-bold text-muted bg-[#f1f5f9] px-2.5 py-1 rounded-pill">
                  {step}
                </span>
                {i < 5 && <ArrowRight className="w-3.5 h-3.5 text-line-2" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Ingestion History */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-[16px] font-extrabold text-ink mb-4">Ingestion History</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>File</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Matched</TableHead>
                <TableHead>Failed</TableHead>
                <TableHead>Total</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ingestions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted">
                    <FileText className="w-10 h-10 mx-auto mb-2 text-line-2" />
                    No ingestions yet. Upload a PDF to get started.
                  </TableCell>
                </TableRow>
              ) : (
                ingestions.map((ing) => {
                  const statusConfig = INGESTION_STATUS_CONFIG[ing.status];
                  const isExpanded = !!expandedIds[ing.id];
                  const logArray = Array.isArray(ing.error_log) ? ing.error_log : [];
                  
                  return (
                    <React.Fragment key={ing.id}>
                      <TableRow className={isExpanded ? 'border-b-0 bg-[#f8fafc]/30' : ''}>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => toggleExpand(ing.id)}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-muted" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="font-bold text-ink max-w-[200px] truncate">
                          {ing.file_path.split('/').pop()}
                        </TableCell>
                        <TableCell>
                          <Badge>{(ing.department as any)?.short_code || '—'}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5" style={{ color: statusConfig.color }}>
                            {getStatusIcon(ing.status)}
                            <Badge
                              className="font-bold"
                              style={{ backgroundColor: statusConfig.bg, color: statusConfig.color }}
                            >
                              {statusConfig.label}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted text-[13px]">
                          {new Date(ing.created_at).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell>
                          <span className="text-success font-bold">{ing.rows_matched}</span>
                        </TableCell>
                        <TableCell>
                          <span className={`font-bold ${ing.rows_failed > 0 ? 'text-error' : 'text-muted'}`}>
                            {ing.rows_failed}
                          </span>
                        </TableCell>
                        <TableCell className="font-bold">{ing.rows_total}</TableCell>
                        <TableCell className="text-right">
                          {(ing.status === 'failed' || ing.status === 'partial') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 hover:bg-[#e2e8f0]"
                              onClick={() => handleRetry(ing.id)}
                              title="Retry ingestion"
                            >
                              <RefreshCw className="w-4 h-4 text-brand-blue" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Expandable Logs section */}
                      {isExpanded && (
                        <TableRow className="bg-[#f8fafc]/30 hover:bg-[#f8fafc]/30">
                          <TableCell colSpan={9} className="p-4 border-t-0">
                            <div className="bg-white rounded-card border border-line-2 p-4 max-h-[300px] overflow-y-auto shadow-sm">
                              <h4 className="font-extrabold text-[13px] text-ink mb-3 flex items-center gap-1.5">
                                <FileText className="w-4 h-4 text-brand-blue" />
                                Processing Logs & Warnings ({logArray.length})
                              </h4>
                              {logArray.length > 0 ? (
                                <div className="space-y-2 text-[12.5px]">
                                  {logArray.map((log: any, idx: number) => {
                                    const isInfo = log.message?.includes('[INFO]');
                                    const isWarning = log.message?.includes('[WARNING]');
                                    let badgeBg = 'bg-[#fdecee] text-[#ef4655]';
                                    let label = 'Error';
                                    if (isInfo) {
                                      badgeBg = 'bg-[#e9f7f1] text-[#27ae8a]';
                                      label = 'Info';
                                    } else if (isWarning) {
                                      badgeBg = 'bg-[#fef9ee] text-[#f5a524]';
                                      label = 'Warning';
                                    }
                                    return (
                                      <div key={idx} className="flex items-start gap-2 py-1.5 border-b border-line-1 last:border-0 last:pb-0">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${badgeBg}`}>
                                          {label}
                                        </span>
                                        {log.row > 0 && (
                                          <span className="font-bold text-muted shrink-0">
                                            Row {log.row}:
                                          </span>
                                        )}
                                        <span className="text-ink break-words">
                                          {log.message?.replace(/\[(INFO|WARNING)\]\s*/, '') || 'Unknown error'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-[12.5px] text-muted font-medium py-2">
                                  No logs or warnings recorded. Ingestion completed successfully without any annotations.
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
