-- 003_create_indexes.sql
-- Performance indexes

CREATE INDEX idx_listings_search_id ON listings(search_id);
CREATE INDEX idx_listings_vehicle_id ON listings(vehicle_id);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_price_history_listing_id ON price_history(listing_id);
CREATE INDEX idx_price_history_recorded_at ON price_history(recorded_at);
CREATE INDEX idx_vehicles_vin ON vehicles(vin);
CREATE INDEX idx_saved_searches_user_id ON saved_searches(user_id);
CREATE INDEX idx_user_vehicle_prefs_user_listing ON user_vehicle_prefs(user_id, listing_id);
