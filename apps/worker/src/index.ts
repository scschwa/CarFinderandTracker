import cron from 'node-cron';
import pLimit from 'p-limit';
import { supabase } from './db/client';
import { runSearchScrape } from './services/search-runner';

const CONCURRENCY = 3;
const CRON_SCHEDULE = '0 7 * * *'; // 7:00 AM ET daily

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

// Start the cron job
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

// Keep process alive
process.on('SIGTERM', () => {
  console.log('[Worker] Received SIGTERM, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Worker] Received SIGINT, shutting down...');
  process.exit(0);
});
