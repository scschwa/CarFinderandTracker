import * as cheerio from 'cheerio';
import { ScrapedListing, SearchParams } from './types';
import { withRetry, randomDelay } from '../utils/retry';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getRandomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function buildSearchUrl(params: SearchParams): string {
  const query = `${params.make} ${params.model}${params.trim ? ' ' + params.trim : ''}`;
  return `https://carsandbids.com/search?q=${encodeURIComponent(query)}`;
}

export async function scrapeCarsAndBids(params: SearchParams): Promise<ScrapedListing[]> {
  const url = buildSearchUrl(params);
  console.log(`[C&B] Scraping: ${url}`);

  const listings: ScrapedListing[] = [];

  try {
    const html = await withRetry(async () => {
      const response = await fetch(url, {
        headers: {
          'User-Agent': getRandomUA(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });

    const $ = cheerio.load(html);

    // C&B auction cards
    $('.auction-card, [class*="auction-item"], .search-result').each((_, el) => {
      try {
        const $el = $(el);
        const titleEl = $el.find('a[href*="/auctions/"], h3 a, .auction-title a').first();
        const title = titleEl.text().trim();
        const listingUrl = titleEl.attr('href') || '';

        if (!title || !listingUrl) return;

        // Extract current bid / price
        const priceText = $el.find('[class*="bid"], [class*="price"], .current-bid').text();
        const priceMatch = priceText.match(/\$?([\d,]+)/);
        const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) * 100 : 0;

        // Check if sold
        const isSold = $el.text().toLowerCase().includes('sold') ||
                       $el.find('[class*="sold"], [class*="completed"]').length > 0;

        // Location
        const location = $el.find('[class*="location"]').text().trim() || '';

        // Image
        const imageUrl = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src') || null;

        // VIN
        const bodyText = $el.text();
        const vinMatch = bodyText.match(/\b[A-HJ-NPR-Z0-9]{17}\b/);

        // Filter by year range
        const yearMatch = title.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
          const year = parseInt(yearMatch[0]);
          if (year < params.year_min || year > params.year_max) return;
        }

        listings.push({
          vin: vinMatch ? vinMatch[0] : null,
          title,
          price,
          url: listingUrl.startsWith('http') ? listingUrl : `https://carsandbids.com${listingUrl}`,
          sourceSite: 'carsandbids',
          location,
          mileage: null,
          status: isSold ? 'sold' : 'active',
          salePrice: isSold ? price : null,
          imageUrl,
        });
      } catch (err) {
        // Skip individual listing parse errors
      }
    });

    await randomDelay(2000, 4000);
  } catch (err) {
    console.error(`[C&B] Scrape error:`, err);
  }

  console.log(`[C&B] Found ${listings.length} listings`);
  return listings;
}
