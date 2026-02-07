import { supabase } from '../db/client';

/**
 * For listings previously active but NOT found in the current scrape:
 * - Mark as 'delisted' (unless already sold)
 */
export async function detectDelistedListings(
  searchId: string,
  foundListingUrls: Set<string>
): Promise<{ delistedIds: string[]; soldIds: string[] }> {
  // Get all active listings for this search
  const { data: activeListings } = await supabase
    .from('listings')
    .select('id, url, status')
    .eq('search_id', searchId)
    .eq('status', 'active');

  const delistedIds: string[] = [];
  const soldIds: string[] = [];

  if (!activeListings) return { delistedIds, soldIds };

  for (const listing of activeListings) {
    if (!foundListingUrls.has(listing.url)) {
      // Listing was not found in this scrape — mark as delisted
      const { error } = await supabase
        .from('listings')
        .update({ status: 'delisted' })
        .eq('id', listing.id);

      if (!error) {
        delistedIds.push(listing.id);
        console.log(`[VehicleTracker] Marked listing ${listing.id} as delisted`);
      }
    }
  }

  return { delistedIds, soldIds };
}

/**
 * Detect cross-listed vehicles (same VIN on different source sites)
 */
export async function detectCrossListings(vehicleId: string): Promise<void> {
  const { data: listings } = await supabase
    .from('listings')
    .select('id, source_site, status')
    .eq('vehicle_id', vehicleId)
    .in('status', ['active', 'cross_listed']);

  if (!listings || listings.length <= 1) return;

  // Get unique source sites
  const sources = new Set(listings.map((l) => l.source_site));
  if (sources.size > 1) {
    // Mark all as cross_listed
    const ids = listings.map((l) => l.id);
    await supabase
      .from('listings')
      .update({ status: 'cross_listed' })
      .in('id', ids);

    console.log(`[VehicleTracker] Marked ${ids.length} listings as cross-listed for vehicle ${vehicleId}`);
  }
}
