-- 002_create_rls_policies.sql
-- Row Level Security policies

-- saved_searches: users see only their own
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own searches" ON saved_searches
  FOR ALL USING (auth.uid() = user_id);

-- listings: users see listings for their searches only
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own listings" ON listings
  FOR SELECT USING (
    search_id IN (SELECT id FROM saved_searches WHERE user_id = auth.uid())
  );

-- Allow service role to insert/update listings (worker uses service role key)
CREATE POLICY "Service role manages listings" ON listings
  FOR ALL USING (auth.role() = 'service_role');

-- user_vehicle_prefs: users see only their own
ALTER TABLE user_vehicle_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own prefs" ON user_vehicle_prefs
  FOR ALL USING (auth.uid() = user_id);

-- notification_settings: users see only their own
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notifications" ON notification_settings
  FOR ALL USING (auth.uid() = user_id);

-- vehicles: readable by any authenticated user (shared data)
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read vehicles" ON vehicles
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow service role to insert/update vehicles
CREATE POLICY "Service role manages vehicles" ON vehicles
  FOR ALL USING (auth.role() = 'service_role');

-- price_history: readable via listing access
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see price history for their listings" ON price_history
  FOR SELECT USING (
    listing_id IN (
      SELECT l.id FROM listings l
      JOIN saved_searches s ON l.search_id = s.id
      WHERE s.user_id = auth.uid()
    )
  );

-- Allow service role to insert price history
CREATE POLICY "Service role manages price history" ON price_history
  FOR ALL USING (auth.role() = 'service_role');

-- scrape_log: service role only
ALTER TABLE scrape_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages scrape log" ON scrape_log
  FOR ALL USING (auth.role() = 'service_role');
