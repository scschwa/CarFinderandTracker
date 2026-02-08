import { GoogleGenerativeAI } from '@google/generative-ai';
import { ScrapedListing, SearchParams } from './types';

const SITE_DOMAINS: Record<string, string> = {
  bat: 'bringatrailer.com',
  carsandbids: 'carsandbids.com',
  autotrader: 'autotrader.com',
  hemmings: 'hemmings.com',
  pcarmarket: 'pcarmarket.com',
  hagerty: 'hagerty.com',
  autohunter: 'autohunter.com',
};

// Delay helper to stay under 15 RPM on free tier
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Use Gemini 2.0 Flash with Google Search grounding to find car listings
 * on a single website. Returns ScrapedListing[] with the real source site.
 */
async function geminiSearchSite(
  params: SearchParams,
  siteName: string,
  apiKey: string,
): Promise<ScrapedListing[]> {
  const domain = SITE_DOMAINS[siteName];
  if (!domain) return [];

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{ googleSearch: {} } as any], // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  const trimPart = params.trim ? ` ${params.trim}` : '';
  const prompt = [
    `Find ${params.year_min} to ${params.year_max} ${params.make} ${params.model}${trimPart} car listings currently for sale on ${domain}.`,
    '',
    'For each listing you find, provide a JSON array of objects with these fields:',
    '- title: the listing title',
    '- price: number in USD (no $ sign, no commas, just the number)',
    '- url: the full URL to the individual listing page on ' + domain,
    '- status: "active" or "sold"',
    '- imageUrl: the main image URL if visible, otherwise null',
    '- location: city/state if visible, otherwise empty string',
    '',
    'Return ONLY a valid JSON array. If no listings are found, return [].',
    'Do not include markdown formatting or code fences, just raw JSON.',
  ].join('\n');

  console.log(`[GeminiFallback] Searching ${domain} for ${params.make} ${params.model}...`);

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  // Extract JSON array from response (handle possible markdown wrapping)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.log(`[GeminiFallback] No JSON array found in response for ${domain}`);
    return [];
  }

  let parsed: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    console.log(`[GeminiFallback] Failed to parse JSON for ${domain}`);
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const listings: ScrapedListing[] = [];

  for (const item of parsed) {
    // Validate URL contains expected domain
    if (!item.url || typeof item.url !== 'string') continue;
    if (!item.url.includes(domain)) continue;

    // Validate URL looks like a real listing (not a search results page)
    try {
      new URL(item.url);
    } catch {
      continue;
    }

    // Parse and validate price
    const rawPrice = typeof item.price === 'number'
      ? item.price
      : parseFloat(String(item.price || '').replace(/[,$]/g, ''));
    if (isNaN(rawPrice) || rawPrice <= 0) continue;

    // Convert dollars to cents
    const priceInCents = Math.round(rawPrice * 100);

    listings.push({
      vin: null,
      title: String(item.title || `${params.make} ${params.model}`),
      price: priceInCents,
      url: item.url,
      sourceSite: siteName as ScrapedListing['sourceSite'],
      location: String(item.location || ''),
      mileage: null,
      status: item.status === 'sold' ? 'sold' : 'active',
      salePrice: null,
      imageUrl: item.imageUrl && typeof item.imageUrl === 'string' ? item.imageUrl : null,
    });
  }

  console.log(`[GeminiFallback] Found ${listings.length} listings on ${domain}`);
  return listings;
}

/**
 * Run Gemini fallback search across multiple sites that returned 0 results.
 * Rate-limited to stay under 15 RPM on Gemini free tier.
 */
export async function geminiFallbackSearch(
  params: SearchParams,
  sitesNeedingFallback: string[],
): Promise<ScrapedListing[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('[GeminiFallback] No GEMINI_API_KEY set, skipping AI fallback');
    return [];
  }

  console.log(`[GeminiFallback] Running AI fallback for ${sitesNeedingFallback.length} sites: ${sitesNeedingFallback.join(', ')}`);

  const allResults: ScrapedListing[] = [];

  for (let i = 0; i < sitesNeedingFallback.length; i++) {
    const site = sitesNeedingFallback[i];

    try {
      const results = await geminiSearchSite(params, site, apiKey);
      allResults.push(...results);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[GeminiFallback] Error searching ${site}:`, msg);
    }

    // Rate limit: 4.5s between calls to stay safely under 15 RPM
    if (i < sitesNeedingFallback.length - 1) {
      await delay(4500);
    }
  }

  console.log(`[GeminiFallback] Total AI-found listings: ${allResults.length}`);
  return allResults;
}
