import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import path from 'path';
import dotenv from 'dotenv';

// Load root .env if it exists, then fallback/override with local app .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();
import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';
import { processPdfIngest } from './processors/pdf-ingest';
import { processBulkImport } from './processors/bulk-import';
import { processKeepAlive } from './processors/keep-alive';

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

// Keep-Alive Worker
const keepAliveWorker = new Worker(
  'keep-alive',
  async (job) => {
    const jobLogger = logger.child({ jobId: job.id });
    jobLogger.info('Processing keep-alive check');
    await processKeepAlive(job.data);
    jobLogger.info('Keep-alive check completed');
  },
  {
    connection: connection as any,
    concurrency: 1,
  }
);

keepAliveWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Keep-alive job completed');
});

keepAliveWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Keep-alive job failed');
});

logger.info('🚀 Samayak Worker started. Listening for jobs…');

// Schedule the keep-alive cron job (every 10 minutes)
const keepAliveQueue = new Queue('keep-alive', { connection: connection as any });

(async () => {
  try {
    // Remove old repeating job if exists and create a new one
    await keepAliveQueue.removeRepeatable('keep-alive-cron', { pattern: '*/10 * * * *' });
    await keepAliveQueue.add(
      'keep-alive-cron',
      { timestamp: new Date().toISOString() },
      {
        repeat: {
          pattern: '*/10 * * * *', // Every 10 minutes
        },
      }
    );
    logger.info('Keep-alive cron job scheduled (every 10 minutes)');
  } catch (error) {
    logger.error({ error }, 'Failed to schedule keep-alive cron job');
  }
})();
import http from 'node:http';
const port = process.env.PORT || 3001;
const healthServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'samayak-worker' }));
});

healthServer.listen(port, () => {
  logger.info(`Health check server listening on port ${port}`);
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down workers…');
  healthServer.close();
  await pdfWorker.close();
  await bulkWorker.close();
  await keepAliveWorker.close();
  await keepAliveQueue.close();
  await connection.quit();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
