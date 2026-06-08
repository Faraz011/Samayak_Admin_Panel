import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

  // Check Supabase DB
  const dbStart = Date.now();
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await supabase.from('departments').select('id').limit(1);
    checks.database = {
      status: error ? 'unhealthy' : 'healthy',
      latency: Date.now() - dbStart,
      ...(error && { error: error.message }),
    };
  } catch (e: any) {
    checks.database = { status: 'unhealthy', latency: Date.now() - dbStart, error: e.message };
  }

  // Check Redis (graceful — only if available)
  const redisStart = Date.now();
  try {
    const Redis = (await import('ioredis')).default;
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await redis.connect();
    await redis.ping();
    checks.redis = { status: 'healthy', latency: Date.now() - redisStart };
    await redis.quit();
  } catch (e: any) {
    checks.redis = { status: 'unavailable', latency: Date.now() - redisStart, error: e.message };
  }

  // Queue status (skip if Redis unavailable)
  if (checks.redis?.status === 'healthy') {
    try {
      const { Queue } = await import('bullmq');
      const queue = new Queue('pdf-ingest', {
        connection: {
          host: process.env.REDIS_URL?.replace('redis://', '').split(':')[0] || 'localhost',
          port: parseInt(process.env.REDIS_URL?.split(':')[2] || '6379'),
        },
      });
      const jobCounts = await queue.getJobCounts();
      checks.queue = { status: 'healthy', ...jobCounts as any };
      await queue.close();
    } catch (e: any) {
      checks.queue = { status: 'unavailable', error: e.message };
    }
  } else {
    checks.queue = { status: 'unavailable', error: 'Redis not connected' };
  }

  const overallStatus = Object.values(checks).every((c) => c.status === 'healthy')
    ? 'healthy'
    : Object.values(checks).some((c) => c.status === 'unhealthy')
    ? 'unhealthy'
    : 'degraded';

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      checks,
    },
    { status: overallStatus === 'healthy' ? 200 : 503 }
  );
}
