import http from 'node:http';
import cron from 'node-cron';
import pLimit from 'p-limit';
import { supabase } from './db/client';
import { runSearchScrape } from './services/search-runner';

const CONCURRENCY = 3;
const CRON_SCHEDULE = '0 7 * * *'; // 7:00 AM ET daily
const PORT = parseInt(process.env.PORT || '3001', 10);
const WORKER_API_KEY = process.env.WORKER_API_KEY;

async function runAllSearches(): Promise<void> {
  console.log('='.repeat(60));
  console.log(`[Worker] Starting daily scrape at ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  const { data: searches, error } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('[Worker] Error fetching searches:', error.message);
    return;
  }

  if (!searches?.length) {
    console.log('[Worker] No active searches found');
    return;
  }

  console.log(`[Worker] Processing ${searches.length} active searches (concurrency: ${CONCURRENCY})`);

  const limit = pLimit(CONCURRENCY);

  const tasks = searches.map((search) =>
    limit(async () => {
      try {
        await runSearchScrape(search);
      } catch (err) {
        console.error(`[Worker] Failed to process search ${search.id}:`, err);
      }
    })
  );

  await Promise.all(tasks);

  console.log('='.repeat(60));
  console.log(`[Worker] Daily scrape completed at ${new Date().toISOString()}`);
  console.log('='.repeat(60));
}

async function runSingleSearch(searchId: string): Promise<{ ok: boolean; message: string }> {
  const { data: search, error } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('id', searchId)
    .single();

  if (error || !search) {
    return { ok: false, message: `Search not found: ${searchId}` };
  }

  console.log(`[Worker] Triggered on-demand scrape for search ${searchId}`);

  try {
    await runSearchScrape(search);
    return { ok: true, message: `Scrape completed for search ${searchId}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Worker] On-demand scrape failed for ${searchId}:`, msg);
    return { ok: false, message: msg };
  }
}

// --- HTTP server for on-demand triggers ---
const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Trigger a single search: POST /trigger/:searchId
  const triggerMatch = req.method === 'POST' && req.url?.match(/^\/trigger\/([a-f0-9-]+)$/);
  if (triggerMatch) {
    // Verify API key
    if (WORKER_API_KEY) {
      const authHeader = req.headers['authorization'];
      if (authHeader !== `Bearer ${WORKER_API_KEY}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    const searchId = triggerMatch[1];
    // Run scrape in the background so we respond quickly
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Scrape started', searchId }));

    runSingleSearch(searchId).then((result) => {
      console.log(`[Worker] On-demand result: ${JSON.stringify(result)}`);
    });
    return;
  }

  // Trigger all searches: POST /trigger-all
  if (req.method === 'POST' && req.url === '/trigger-all') {
    if (WORKER_API_KEY) {
      const authHeader = req.headers['authorization'];
      if (authHeader !== `Bearer ${WORKER_API_KEY}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Full scrape started' }));

    runAllSearches().catch((err) => {
      console.error('[Worker] Trigger-all error:', err);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[Worker] HTTP server listening on port ${PORT}`);
});

// --- Cron scheduler ---
console.log(`[Worker] Starting cron scheduler (schedule: ${CRON_SCHEDULE} ET)`);
console.log('[Worker] Waiting for next scheduled run...');

cron.schedule(CRON_SCHEDULE, () => {
  runAllSearches().catch((err) => {
    console.error('[Worker] Unhandled error in daily scrape:', err);
  });
}, {
  timezone: 'America/New_York',
});

// Also run immediately on startup if RUN_ON_START is set
if (process.env.RUN_ON_START === 'true') {
  console.log('[Worker] RUN_ON_START=true, running immediately...');
  runAllSearches().catch((err) => {
    console.error('[Worker] Unhandled error in startup scrape:', err);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Worker] Received SIGTERM, shutting down...');
  server.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Worker] Received SIGINT, shutting down...');
  server.close();
  process.exit(0);
});
