import { NextRequest, NextResponse } from 'next/server';
import pino from 'pino';

const logger = pino({ name: 'cron-keep-awake' });

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // 1. Verify Vercel Cron Secret (if configured)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('Unauthorized cron invocation attempt');
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Fetch the Render Worker URL
  const workerUrl = process.env.RENDER_WORKER_URL;
  if (!workerUrl) {
    logger.error('RENDER_WORKER_URL is not configured in the environment');
    return NextResponse.json(
      { success: false, error: 'RENDER_WORKER_URL is not configured' },
      { status: 400 }
    );
  }

  // Normalize the URL
  let targetUrl = workerUrl.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://${targetUrl}`;
  }

  logger.info({ targetUrl }, 'Pinging Render worker to keep it awake...');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8-second timeout

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Samayak-Keep-Awake-Cron',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      logger.info({ status: response.status, data }, 'Render worker ping successful');
      return NextResponse.json({
        success: true,
        message: 'Render worker pinged successfully',
        status: response.status,
        data,
      });
    } else {
      const text = await response.text().catch(() => '');
      logger.warn({ status: response.status, text }, 'Render worker returned non-OK status');
      return NextResponse.json({
        success: false,
        error: `Worker returned status ${response.status}`,
        detail: text.substring(0, 200),
      }, { status: 502 });
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to connect to Render worker');
    return NextResponse.json({
      success: false,
      error: `Connection failed: ${error.message}`,
    }, { status: 500 });
  }
}
