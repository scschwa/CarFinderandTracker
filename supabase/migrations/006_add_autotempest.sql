-- Add 'autotempest' to listings source_site CHECK constraint
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_source_site_check;
ALTER TABLE listings ADD CONSTRAINT listings_source_site_check
  CHECK (source_site IN ('autotrader', 'bat', 'carsandbids', 'hemmings', 'pcarmarket', 'hagerty', 'autohunter', 'autotempest'));

-- Update default enabled_sites to include autotempest
ALTER TABLE saved_searches
  ALTER COLUMN enabled_sites SET DEFAULT '{bat,carsandbids,autotrader,hemmings,pcarmarket,hagerty,autohunter,autotempest}';

-- Backfill existing rows to include autotempest
UPDATE saved_searches
  SET enabled_sites = array_append(enabled_sites, 'autotempest')
  WHERE NOT ('autotempest' = ANY(enabled_sites));
