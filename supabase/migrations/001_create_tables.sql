-- 001_create_tables.sql
-- Core tables for Car Finder & Tracker

-- 1. Saved Searches
CREATE TABLE saved_searches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  make          TEXT NOT NULL,
  model         TEXT NOT NULL,
  trim          TEXT,
  year_min      INT NOT NULL,
  year_max      INT NOT NULL,
  zip_code      TEXT NOT NULL,
  search_radius INT DEFAULT 100,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. Vehicles (unique by VIN across all users)
CREATE TABLE vehicles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vin           TEXT UNIQUE NOT NULL,
  make          TEXT,
  model         TEXT,
  trim          TEXT,
  year          INT,
  exterior_color TEXT,
  interior_color TEXT,
  mileage       INT,
  transmission  TEXT,
  drivetrain    TEXT,
  engine        TEXT,
  vin_data      JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 3. Listings
CREATE TABLE listings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  search_id     UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  source_site   TEXT NOT NULL CHECK (source_site IN ('autotrader', 'bat', 'carsandbids')),
  url           TEXT NOT NULL,
  current_price INT,
  sale_price    INT,
  geography     TEXT,
  distance_mi   INT,
  image_url     TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'cross_listed', 'sold', 'delisted')),
  first_seen    TIMESTAMPTZ DEFAULT now(),
  last_seen     TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 4. Price History
CREATE TABLE price_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  price         INT NOT NULL,
  recorded_at   TIMESTAMPTZ DEFAULT now()
);

-- 5. User-Vehicle Preferences (hide, favorite)
CREATE TABLE user_vehicle_prefs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id    UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  is_hidden     BOOLEAN DEFAULT false,
  is_favorited  BOOLEAN DEFAULT false,
  UNIQUE(user_id, listing_id)
);

-- 6. Notification Settings
CREATE TABLE notification_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_id           UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  price_drop_enabled  BOOLEAN DEFAULT false,
  price_drop_pct      INT DEFAULT 5,
  new_listing_enabled BOOLEAN DEFAULT true,
  sold_alert_enabled  BOOLEAN DEFAULT false,
  email               TEXT,
  UNIQUE(user_id, search_id)
);

-- 7. Scrape Log
CREATE TABLE scrape_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id     UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  source_site   TEXT NOT NULL,
  status        TEXT NOT NULL,
  listings_found INT DEFAULT 0,
  error_message TEXT,
  duration_ms   INT,
  scraped_at    TIMESTAMPTZ DEFAULT now()
);
