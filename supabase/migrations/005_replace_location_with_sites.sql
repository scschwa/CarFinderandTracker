-- 005_replace_location_with_sites.sql
-- Replace zip_code/search_radius with enabled_sites multi-select

-- Make zip_code and search_radius nullable (keep columns for existing data)
ALTER TABLE saved_searches
  ALTER COLUMN zip_code DROP NOT NULL,
  ALTER COLUMN zip_code SET DEFAULT NULL;

ALTER TABLE saved_searches
  ALTER COLUMN search_radius SET DEFAULT NULL;

-- Add enabled_sites column (TEXT array, default all 7)
ALTER TABLE saved_searches
  ADD COLUMN IF NOT EXISTS enabled_sites TEXT[]
    DEFAULT '{bat,carsandbids,autotrader,hemmings,pcarmarket,hagerty,autohunter}';

-- Backfill existing rows
UPDATE saved_searches
  SET enabled_sites = '{bat,carsandbids,autotrader,hemmings,pcarmarket,hagerty,autohunter}'
  WHERE enabled_sites IS NULL;
