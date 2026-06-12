import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import pino from 'pino';

const logger = pino({ name: 'api-pdf-ingestions-process' });

export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || `cor_fallback_${Date.now()}`;
  
  try {
    const body = await request.json();
    const ingestionId = body.ingestion_id;

    if (!ingestionId) {
      return NextResponse.json({ error: 'ingestion_id is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // 1. Fetch the ingestion record
    const { data: ingestion, error: fetchError } = await supabase
      .from('pdf_ingestions')
      .select('*')
      .eq('id', ingestionId)
      .single();

    if (fetchError || !ingestion) {
      return NextResponse.json({ error: 'Ingestion record not found' }, { status: 404 });
    }

    // 2. Reset status to queued and clear error logs
    const { error: updateError } = await supabase
      .from('pdf_ingestions')
      .update({
        status: 'queued',
        error_log: [],
      })
      .eq('id', ingestionId);

    if (updateError) {
      logger.error({ error: updateError.message, ingestionId }, 'Failed to reset ingestion status to queued');
      return NextResponse.json({ error: `Failed to update status: ${updateError.message}` }, { status: 500 });
    }

    // 3. Queue the ingestion job in BullMQ to be processed asynchronously by the background worker
    logger.info({ ingestion_id: ingestionId }, 'Queueing PDF processing job in BullMQ (via process route)...');
    try {
      const { Queue } = await import('bullmq');
      const Redis = (await import('ioredis')).default;
      
      const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
      });

      const queue = new Queue('pdf-ingest', { connection: connection as any });

      await queue.add('process-pdf', {
        file_path: ingestion.file_path,
        department_id: ingestion.department_id,
        correlation_id: correlationId,
        ingestion_id: ingestionId,
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });

      await queue.close();
      await connection.quit();
      logger.info({ ingestion_id: ingestionId }, 'PDF ingestion job successfully queued in Redis');
    } catch (queueError: any) {
      logger.error({ error: queueError.message, ingestion_id: ingestionId }, 'Failed to queue job in Redis');
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
    logger.error({ error: error.message }, 'Failed to queue PDF ingestion in process route');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
