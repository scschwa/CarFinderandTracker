import { supabase } from '../db/client';
import { ScrapedListing, SearchParams } from '../scrapers/types';
import { scrapeBaT } from '../scrapers/bat';
import { scrapeCarsAndBids } from '../scrapers/carsandbids';
import { scrapeAutotrader } from '../scrapers/autotrader';
import { scrapeHemmings } from '../scrapers/hemmings';
import { scrapePcarmarket } from '../scrapers/pcarmarket';
import { scrapeHagerty } from '../scrapers/hagerty';
import { scrapeAutohunter } from '../scrapers/autohunter';
import { recordPrice, getPreviousPrice } from './price-recorder';
import { detectDelistedListings, detectCrossListings } from './vehicle-tracker';
import { sendNotifications } from './notifier';
import { geminiFallbackSearch } from '../scrapers/gemini-fallback';

export async function runSearchScrape(search: {
  id: string;
  make: string;
  model: string;
  trim: string | null;
  year_min: number;
  year_max: number;
  enabled_sites: string[] | null;
}): Promise<void> {
  console.log(`\n[SearchRunner] Starting scrape for: ${search.make} ${search.model} (${search.id})`);

  const params: SearchParams = {
    make: search.make,
    model: search.model,
    trim: search.trim,
    year_min: search.year_min,
    year_max: search.year_max,
  };

  const allListings: ScrapedListing[] = [];
  const allScrapers = [
    { name: 'bat', fn: () => scrapeBaT(params) },
    { name: 'carsandbids', fn: () => scrapeCarsAndBids(params) },
    { name: 'autotrader', fn: () => scrapeAutotrader(params) },
    { name: 'hemmings', fn: () => scrapeHemmings(params) },
    { name: 'pcarmarket', fn: () => scrapePcarmarket(params) },
    { name: 'hagerty', fn: () => scrapeHagerty(params) },
    { name: 'autohunter', fn: () => scrapeAutohunter(params) },
  ];

  const enabledSites = search.enabled_sites || ['bat', 'carsandbids', 'autotrader', 'hemmings', 'pcarmarket', 'hagerty', 'autohunter'];
  const scrapers = allScrapers.filter(s => enabledSites.includes(s.name));

  // Mark scrape as running for frontend progress tracking
  await supabase.from('saved_searches').update({
    scrape_status: 'running',
    scrape_step: 0,
    scrape_total_steps: scrapers.length,
    scrape_current_site: null,
    scrape_started_at: new Date().toISOString(),
  }).eq('id', search.id);

  for (let i = 0; i < scrapers.length; i++) {
    const scraper = scrapers[i];

    // Update progress: which scraper is currently running
    await supabase.from('saved_searches').update({
      scrape_current_site: scraper.name,
      scrape_step: i,
    }).eq('id', search.id);

    const start = Date.now();
    let status = 'success';
    let listingsFound = 0;
    let errorMessage: string | null = null;

    try {
      const results = await scraper.fn();
      allListings.push(...results);
      listingsFound = results.length;
    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[SearchRunner] ${scraper.name} error:`, errorMessage);
    }

    const durationMs = Date.now() - start;

    // Log to scrape_log
    await supabase.from('scrape_log').insert({
      search_id: search.id,
      source_site: scraper.name,
      status,
      listings_found: listingsFound,
      error_message: errorMessage,
      duration_ms: durationMs,
    });
  }

  // Gemini AI fallback: if fewer than 5 listings found, use AI to search sites that returned 0
  if (process.env.GEMINI_API_KEY && allListings.length < 5) {
    const sitesWithResults: Set<string> = new Set(allListings.map(l => l.sourceSite));
    const sitesNeedingFallback = enabledSites.filter(s => !sitesWithResults.has(s));

    if (sitesNeedingFallback.length > 0) {
      // Update progress to show AI fallback step
      await supabase.from('saved_searches').update({
        scrape_total_steps: scrapers.length + 1,
        scrape_step: scrapers.length,
        scrape_current_site: 'ai-fallback',
      }).eq('id', search.id);

      const fallbackStart = Date.now();
      let fallbackStatus = 'success';
      let fallbackCount = 0;
      let fallbackError: string | null = null;

      try {
        const existingUrls = new Set(allListings.map(l => l.url));
        const fallbackResults = await geminiFallbackSearch(params, sitesNeedingFallback);

        // Deduplicate against existing listings by URL
        const newResults = fallbackResults.filter(r => !existingUrls.has(r.url));
        allListings.push(...newResults);
        fallbackCount = newResults.length;
      } catch (err) {
        fallbackStatus = 'error';
        fallbackError = err instanceof Error ? err.message : String(err);
        console.error('[SearchRunner] Gemini fallback error:', fallbackError);
      }

      await supabase.from('scrape_log').insert({
        search_id: search.id,
        source_site: 'ai-fallback',
        status: fallbackStatus,
        listings_found: fallbackCount,
        error_message: fallbackError,
        duration_ms: Date.now() - fallbackStart,
      });
    }
  }

  // Process scraped listings
  const newListingAlerts: { title: string; price: number; sourceSite: string; url: string }[] = [];
  const priceDropAlerts: { listingTitle: string; oldPrice: number; newPrice: number; dropPct: number; url: string }[] = [];
  const soldAlerts: { title: string; salePrice: number; sourceSite: string; url: string }[] = [];
  const foundUrls = new Set<string>();

  for (const scraped of allListings) {
    // Skip listings with no price
    if (!scraped.price || scraped.price === 0) continue;

    foundUrls.add(scraped.url);

    // URL-based dedup: check if a listing with this URL already exists for this search
    const { data: existingByUrl } = await supabase
      .from('listings')
      .select('id, vehicle_id, current_price, status')
      .eq('search_id', search.id)
      .eq('url', scraped.url)
      .single();

    if (existingByUrl) {
      // Update existing listing found by URL
      const updates: Record<string, unknown> = {
        last_seen: new Date().toISOString(),
        current_price: scraped.price,
      };

      if (scraped.status === 'sold' && existingByUrl.status !== 'sold') {
        updates.status = 'sold';
        updates.sale_price = scraped.salePrice || scraped.price;
        soldAlerts.push({
          title: scraped.title,
          salePrice: scraped.salePrice || scraped.price,
          sourceSite: scraped.sourceSite,
          url: scraped.url,
        });
      }

      // Update VIN on the vehicle if we now have a real one
      if (scraped.vin) {
        await supabase.from('vehicles').update({ vin: scraped.vin }).eq('id', existingByUrl.vehicle_id);
      }

      await supabase.from('listings').update(updates).eq('id', existingByUrl.id);

      if (scraped.price && existingByUrl.current_price) {
        const oldPrice = existingByUrl.current_price;
        const newPrice = scraped.price;
        if (newPrice < oldPrice) {
          const dropPct = ((oldPrice - newPrice) / oldPrice) * 100;
          priceDropAlerts.push({
            listingTitle: scraped.title,
            oldPrice,
            newPrice,
            dropPct,
            url: scraped.url,
          });
        }
      }

      if (scraped.price) {
        await recordPrice(existingByUrl.id, scraped.price);
      }

      if (scraped.vin) {
        await detectCrossListings(existingByUrl.vehicle_id);
      }

      continue;
    }

    // No existing listing by URL — create vehicle and listing
    let vehicleId: string | null = null;

    if (scraped.vin) {
      const { data: existingVehicle } = await supabase
        .from('vehicles')
        .select('id')
        .eq('vin', scraped.vin)
        .single();

      if (existingVehicle) {
        vehicleId = existingVehicle.id;
      } else {
        // Parse year/make/model from title
        const yearMatch = scraped.title.match(/\b(19|20)\d{2}\b/);
        const { data: newVehicle } = await supabase
          .from('vehicles')
          .insert({
            vin: scraped.vin,
            make: search.make,
            model: search.model,
            year: yearMatch ? parseInt(yearMatch[0]) : null,
            mileage: scraped.mileage,
          })
          .select('id')
          .single();

        vehicleId = newVehicle?.id || null;
      }
    } else {
      // No VIN — create a placeholder vehicle
      const { data: newVehicle } = await supabase
        .from('vehicles')
        .insert({
          vin: `UNKNOWN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          make: search.make,
          model: search.model,
        })
        .select('id')
        .single();

      vehicleId = newVehicle?.id || null;
    }

    if (!vehicleId) continue;

    // Check if listing already exists
    const { data: existingListing } = await supabase
      .from('listings')
      .select('id, current_price, status')
      .eq('vehicle_id', vehicleId)
      .eq('search_id', search.id)
      .eq('source_site', scraped.sourceSite)
      .single();

    if (existingListing) {
      // Update existing listing
      const updates: Record<string, unknown> = {
        last_seen: new Date().toISOString(),
        current_price: scraped.price,
      };

      if (scraped.status === 'sold' && existingListing.status !== 'sold') {
        updates.status = 'sold';
        updates.sale_price = scraped.salePrice || scraped.price;
        soldAlerts.push({
          title: scraped.title,
          salePrice: scraped.salePrice || scraped.price,
          sourceSite: scraped.sourceSite,
          url: scraped.url,
        });
      }

      await supabase.from('listings').update(updates).eq('id', existingListing.id);

      // Check for price drop
      if (scraped.price && existingListing.current_price) {
        const oldPrice = existingListing.current_price;
        const newPrice = scraped.price;
        if (newPrice < oldPrice) {
          const dropPct = ((oldPrice - newPrice) / oldPrice) * 100;
          priceDropAlerts.push({
            listingTitle: scraped.title,
            oldPrice,
            newPrice,
            dropPct,
            url: scraped.url,
          });
        }
      }

      // Record price
      if (scraped.price) {
        await recordPrice(existingListing.id, scraped.price);
      }
    } else {
      // Insert new listing
      const { data: newListing } = await supabase
        .from('listings')
        .insert({
          vehicle_id: vehicleId,
          search_id: search.id,
          source_site: scraped.sourceSite,
          url: scraped.url,
          current_price: scraped.price,
          sale_price: scraped.salePrice,
          geography: scraped.location,
          image_url: scraped.imageUrl,
          status: scraped.status === 'sold' ? 'sold' : 'active',
        })
        .select('id')
        .single();

      if (newListing && scraped.price) {
        await recordPrice(newListing.id, scraped.price);
      }

      newListingAlerts.push({
        title: scraped.title,
        price: scraped.price,
        sourceSite: scraped.sourceSite,
        url: scraped.url,
      });
    }

    // Check for cross-listings
    if (scraped.vin) {
      await detectCrossListings(vehicleId);
    }
  }

  // Detect delisted listings
  await detectDelistedListings(search.id, foundUrls);

  // Send notifications
  await sendNotifications(search.id, {
    priceDrops: priceDropAlerts,
    newListings: newListingAlerts,
    soldVehicles: soldAlerts,
  });

  console.log(`[SearchRunner] Completed scrape for ${search.make} ${search.model}: ${allListings.length} total listings`);

  // Mark scrape as complete for frontend progress tracking
  await supabase.from('saved_searches').update({
    scrape_status: 'complete',
    scrape_current_site: null,
    scrape_step: scrapers.length,
  }).eq('id', search.id);
}
