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

    // Queue the ingestion job in BullMQ to be processed asynchronously by the background worker
    logger.info({ ingestion_id: ingestion.id }, 'Queueing PDF processing job in BullMQ...');
    try {
      const { Queue } = await import('bullmq');
      const Redis = (await import('ioredis')).default;
      
      const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
      });

      const queue = new Queue('pdf-ingest', { connection: connection as any });

      await queue.add('process-pdf', {
        file_path,
        department_id,
        correlation_id: correlationId,
        ingestion_id: ingestion.id,
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });

      await queue.close();
      await connection.quit();
      logger.info({ ingestion_id: ingestion.id }, 'PDF ingestion job successfully queued in Redis');
    } catch (queueError: any) {
      logger.error({ error: queueError.message, ingestion_id: ingestion.id }, 'Failed to queue job in Redis');
      return NextResponse.json(
        { error: `Queueing failed: ${queueError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'PDF ingestion queued for background processing',
      correlationId,
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
