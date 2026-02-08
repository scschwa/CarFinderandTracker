-- 004_scrape_progress.sql
-- Add scrape progress tracking columns to saved_searches

ALTER TABLE saved_searches
  ADD COLUMN IF NOT EXISTS scrape_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS scrape_current_site TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS scrape_step INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scrape_total_steps INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scrape_started_at TIMESTAMPTZ DEFAULT NULL;

-- Fix: listings.source_site CHECK constraint only allows 3 original sites.
-- Need to allow all 7 scraper sources.
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_source_site_check;
ALTER TABLE listings ADD CONSTRAINT listings_source_site_check
  CHECK (source_site IN ('autotrader', 'bat', 'carsandbids', 'hemmings', 'pcarmarket', 'hagerty', 'autohunter'));
