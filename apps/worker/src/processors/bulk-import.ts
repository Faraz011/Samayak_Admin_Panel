import { getSupabase } from '../lib/supabase';
import pino from 'pino';
import * as XLSX from 'xlsx';

const pinoLogger = pino({ name: 'bulk-import-processor' });

export interface BulkImportJobData {
  file_path: string;
  entity_type: string;
  correlation_id?: string;
}

export async function processBulkImport(data: BulkImportJobData) {
  const correlationId = data.correlation_id || `cor_fallback_${Date.now()}`;
  const logger = pinoLogger.child({ correlationId });
  const supabase = getSupabase();
  const { file_path, entity_type } = data;

  // Find the import record
  const { data: importRecord } = await supabase
    .from('bulk_imports')
    .select('id')
    .eq('file_path', file_path)
    .single();

  if (!importRecord) {
    logger.error({ file_path }, 'Import record not found');
    return;
  }

  const importId = importRecord.id;

  try {
    await supabase.from('bulk_imports').update({ status: 'processing' }).eq('id', importId);

    // Retrieve CSV/Excel content from database row
    const { data: contentData, error: contentError } = await supabase
      .from('bulk_imports')
      .select('file_content')
      .eq('id', importId)
      .single();

    if (contentError || !contentData || !contentData.file_content) {
      throw new Error(`Failed to retrieve file content from database: ${contentError?.message || 'No content'}`);
    }

    const buffer = Buffer.from(contentData.file_content, 'base64');

    // Parse file (CSV or Excel)
    let rows: Record<string, any>[];
    if (file_path.endsWith('.csv')) {
      const text = buffer.toString('utf-8');
      rows = parseCSV(text);
    } else {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet);
    }

    logger.info({ rowCount: rows.length, entity_type }, 'File parsed');

    await supabase.from('bulk_imports').update({ rows_total: rows.length }).eq('id', importId);

    let created = 0;
    let failedCount = 0;
    const report: Array<{ row: number; status: string; message?: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      try {
        switch (entity_type) {
          case 'departments': {
            const { error } = await supabase.from('departments').upsert(
              { name: row.name, short_code: row.short_code },
              { onConflict: 'short_code' }
            );
            if (error) throw error;
            created++;
            report.push({ row: i + 1, status: 'created' });
            break;
          }

          case 'rooms': {
            // Look up department by short_code
            const { data: dept } = await supabase
              .from('departments')
              .select('id')
              .eq('short_code', row.department || row.department_code)
              .single();

            if (!dept) {
              report.push({ row: i + 1, status: 'failed', message: `Department not found: ${row.department}` });
              failedCount++;
              continue;
            }

            const { error } = await supabase.from('rooms').insert({
              room_number: row.room_number,
              department_id: dept.id,
              capacity: parseInt(row.capacity),
              room_type: row.room_type || 'classroom',
            });
            if (error) throw error;
            created++;
            report.push({ row: i + 1, status: 'created' });
            break;
          }

          case 'courses': {
            const { data: dept } = await supabase
              .from('departments')
              .select('id')
              .eq('short_code', row.department || row.department_code)
              .single();

            if (!dept) {
              report.push({ row: i + 1, status: 'failed', message: `Department not found: ${row.department}` });
              failedCount++;
              continue;
            }

            const { error } = await supabase.from('courses').insert({
              code: row.code,
              name: row.name,
              credits: parseInt(row.credits),
              course_type: row.course_type || 'lecture',
              department_id: dept.id,
              branch: row.branch,
              semester: parseInt(row.semester),
            });
            if (error) throw error;
            created++;
            report.push({ row: i + 1, status: 'created' });
            break;
          }

          case 'faculty': {
            // Look up department by short_code
            const { data: dept } = await supabase
              .from('departments')
              .select('id')
              .eq('short_code', row.department || row.department_code)
              .single();

            if (!dept) {
              report.push({ row: i + 1, status: 'failed', message: `Department not found: ${row.department || row.department_code}` });
              failedCount++;
              continue;
            }

            if (!row.email || !(row.full_name || row.name)) {
              report.push({ row: i + 1, status: 'failed', message: 'Missing email or full_name/name' });
              failedCount++;
              continue;
            }

            // Create user in auth
            const { data: authData, error: createAuthError } = await supabase.auth.admin.createUser({
              email: row.email,
              password: row.password || 'faculty123',
              email_confirm: true,
              user_metadata: {
                role: row.role || 'professor',
                full_name: row.full_name || row.name,
                department_id: dept.id
              }
            });

            if (createAuthError || !authData.user) {
              if (createAuthError?.message?.includes('already exists') || createAuthError?.message?.includes('already registered')) {
                // Find existing auth user
                const { data: listData } = await supabase.auth.admin.listUsers();
                const existingUser = listData?.users?.find(u => u.email === row.email);
                if (existingUser) {
                  const { error: profileError } = await supabase.from('profiles').upsert({
                    id: existingUser.id,
                    email: row.email,
                    full_name: row.full_name || row.name,
                    role: row.role || 'professor',
                    department_id: dept.id,
                  }, { onConflict: 'id' });
                  if (profileError) throw profileError;
                  created++;
                  report.push({ row: i + 1, status: 'created', message: 'Auth user existed, profile upserted' });
                  continue;
                }
              }
              throw createAuthError || new Error('Failed to create auth user');
            }

            const { error: profileError } = await supabase.from('profiles').upsert({
              id: authData.user.id,
              email: row.email,
              full_name: row.full_name || row.name,
              role: row.role || 'professor',
              department_id: dept.id,
            }, { onConflict: 'id' });

            if (profileError) throw profileError;

            created++;
            report.push({ row: i + 1, status: 'created' });
            break;
          }

          default:
            report.push({ row: i + 1, status: 'failed', message: `Unknown entity type: ${entity_type}` });
            failedCount++;
        }
      } catch (rowError: any) {
        const isDuplicate = rowError.message?.includes('duplicate') || rowError.code === '23505';
        report.push({
          row: i + 1,
          status: isDuplicate ? 'skipped' : 'failed',
          message: isDuplicate ? 'Duplicate entry — skipped' : rowError.message,
        });
        if (!isDuplicate) failedCount++;
      }
    }

    // Finalize
    await supabase.from('bulk_imports').update({
      status: 'done',
      rows_created: created,
      rows_failed: failedCount,
      report,
    }).eq('id', importId);

    logger.info({ importId, created, failed: failedCount }, 'Bulk import completed');

  } catch (error: any) {
    logger.error({ importId, error: error.message }, 'Bulk import failed');

    await supabase.from('bulk_imports').update({
      status: 'failed',
      report: [{ row: 0, status: 'failed', message: error.message }],
    }).eq('id', importId);
  }
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));

  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/"/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || '';
    });
    return row;
  });
}
