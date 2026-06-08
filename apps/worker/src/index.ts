import path from 'path';
import dotenv from 'dotenv';

// Load root .env if it exists, then fallback/override with local app .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';
import { processPdfIngest } from './processors/pdf-ingest';
import { processBulkImport } from './processors/bulk-import';

const logger = pino({ name: 'samayak-worker' });

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

logger.info({ redisUrl }, 'Connecting to Redis…');

// PDF Ingestion Worker
const pdfWorker = new Worker(
  'pdf-ingest',
  async (job) => {
    const correlationId = job.data.correlation_id || `cor_fallback_${Date.now()}`;
    const jobLogger = logger.child({ correlationId, jobId: job.id });
    jobLogger.info({ data: job.data }, 'Processing PDF ingestion job');
    
    // Inject the correlation_id if not present
    job.data.correlation_id = correlationId;
    
    await processPdfIngest(job.data);
    jobLogger.info('PDF ingestion job completed');
  },
  {
    connection: connection as any,
    concurrency: 2,
    limiter: { max: 5, duration: 60000 },
  }
);

pdfWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, correlationId: job.data.correlation_id }, 'PDF job completed');
});

pdfWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, correlationId: job?.data?.correlation_id, error: err.message }, 'PDF job failed');
});

// Bulk Import Worker
const bulkWorker = new Worker(
  'bulk-import',
  async (job) => {
    const correlationId = job.data.correlation_id || `cor_fallback_${Date.now()}`;
    const jobLogger = logger.child({ correlationId, jobId: job.id });
    jobLogger.info({ data: job.data }, 'Processing bulk import job');
    
    // Inject the correlation_id if not present
    job.data.correlation_id = correlationId;

    await processBulkImport(job.data);
    jobLogger.info('Bulk import job completed');
  },
  {
    connection: connection as any,
    concurrency: 2,
  }
);

bulkWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, correlationId: job.data.correlation_id }, 'Bulk import job completed');
});

bulkWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, correlationId: job?.data?.correlation_id, error: err.message }, 'Bulk import job failed');
});

logger.info('🚀 Samayak Worker started. Listening for jobs…');

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down workers…');
  await pdfWorker.close();
  await bulkWorker.close();
  await connection.quit();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
