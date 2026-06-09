import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import pino from 'pino';
import { recordAuditLog } from '@/lib/audit';

const baseLogger = pino({ name: 'api-pdf-ingestions' });

export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || `cor_fallback_${Date.now()}`;
  const logger = baseLogger.child({ correlationId });

  try {
    const body = await request.json();
    const { file_path, department_id } = body;

    logger.info({ file_path, department_id }, 'Received PDF Ingestion request');

    if (!file_path || !department_id) {
      logger.warn('Missing required parameters file_path or department_id');
      return NextResponse.json({ error: 'file_path and department_id required' }, { status: 400 });
    }

    // Record audit log entry
    await recordAuditLog({
      action: 'INGEST_PDF_REQUESTED',
      entityType: 'pdf_ingestions',
      payload: { file_path, department_id },
      correlationId,
    });

    const supabase = createServiceRoleClient();

    // Find the ingestion record created by the frontend
    const { data: ingestion, error: fetchError } = await supabase
      .from('pdf_ingestions')
      .select('id')
      .eq('file_path', file_path)
      .single();

    if (fetchError || !ingestion) {
      logger.error({ file_path, error: fetchError?.message }, 'Ingestion record not found');
      return NextResponse.json({ error: 'Associated ingestion record not found' }, { status: 404 });
    }

    // Call the dedicated inline processing route synchronously to ensure it completes under serverless envs
    logger.info({ ingestion_id: ingestion.id }, 'Triggering inline PDF processing...');
    const processUrl = new URL('/api/pdf-ingestions/process', request.url);
    
    // We call the process API route
    const processResponse = await fetch(processUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-correlation-id': correlationId,
      },
      body: JSON.stringify({ ingestion_id: ingestion.id }),
    });

    if (!processResponse.ok) {
      const errorText = await processResponse.text();
      logger.error({ status: processResponse.status, errorText }, 'Inline processing endpoint returned error');
      return NextResponse.json(
        { error: `Processing failed: ${errorText}` },
        { status: processResponse.status }
      );
    }

    const processResult = await processResponse.json();
    logger.info({ ingestion_id: ingestion.id, processResult }, 'PDF ingestion processing finished');

    return NextResponse.json({
      success: true,
      message: 'PDF ingestion completed inline',
      correlationId,
      result: processResult,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to process PDF ingestion');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || `cor_fallback_${Date.now()}`;
  const logger = baseLogger.child({ correlationId });

  try {
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pdf_ingestions')
      .select('*, department:departments(*)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch PDF ingestions');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
