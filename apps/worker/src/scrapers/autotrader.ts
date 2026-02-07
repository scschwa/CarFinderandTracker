import { ScrapedListing, SearchParams } from './types';
import { withRetry, randomDelay } from '../utils/retry';

// Autotrader uses Playwright for heavy JS rendering + bot detection
// This scraper requires playwright to be installed in the worker environment

function buildSearchUrl(params: SearchParams): string {
  const makeSlug = params.make.toLowerCase().replace(/\s+/g, '-');
  const modelSlug = params.model.toLowerCase().replace(/\s+/g, '-');
  return `https://www.autotrader.com/cars-for-sale/all-cars/${makeSlug}/${modelSlug}` +
    `?zip=${params.zip_code}` +
    `&searchRadius=${params.search_radius}` +
    `&startYear=${params.year_min}` +
    `&endYear=${params.year_max}` +
    `&isNewSearch=true&marketExtension=include&showAccelerateBanner=false&sortBy=relevance&numRecords=25`;
}

export async function scrapeAutotrader(params: SearchParams): Promise<ScrapedListing[]> {
  const url = buildSearchUrl(params);
  console.log(`[Autotrader] Scraping: ${url}`);

  const listings: ScrapedListing[] = [];

  try {
    // Dynamic import to avoid loading playwright when not scraping autotrader
    const { chromium } = await import('playwright');

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();

    await withRetry(async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // Wait for listings to render
      await page.waitForSelector('[data-cmp="inventoryListing"], .inventory-listing', { timeout: 15000 }).catch(() => {});
    });

    // Extract listings from page
    const items = await page.$$('[data-cmp="inventoryListing"], .inventory-listing');
    let pagesScraped = 0;
    const maxPages = 5;

    while (pagesScraped < maxPages) {
      const pageItems = await page.$$('[data-cmp="inventoryListing"], .inventory-listing');

      for (const item of pageItems) {
        try {
          const title = await item.$eval(
            'h2, [data-cmp="inventoryListingTitle"], .listing-title',
            (el: Element) => el.textContent?.trim() || ''
          ).catch(() => '');

          if (!title) continue;

          const listingUrl = await item.$eval(
            'a[href*="/cars-for-sale/"]',
            (el: Element) => (el as HTMLAnchorElement).href
          ).catch(() => '');

          const priceText = await item.$eval(
            '[data-cmp="firstPrice"], .first-price, .listing-price',
            (el: Element) => el.textContent?.trim() || ''
          ).catch(() => '');

          const priceMatch = priceText.match(/\$?([\d,]+)/);
          const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) * 100 : 0;

          const mileageText = await item.$eval(
            '[class*="mileage"], .listing-mileage',
            (el: Element) => el.textContent?.trim() || ''
          ).catch(() => '');
          const mileageMatch = mileageText.match(/([\d,]+)\s*mi/i);
          const mileage = mileageMatch ? parseInt(mileageMatch[1].replace(/,/g, '')) : null;

          const location = await item.$eval(
            '[class*="dealer-name"], .dealer-location',
            (el: Element) => el.textContent?.trim() || ''
          ).catch(() => '');

          const imageUrl = await item.$eval(
            'img',
            (el: Element) => (el as HTMLImageElement).src
          ).catch(() => null);

          // Filter by year
          const yearMatch = title.match(/\b(19|20)\d{2}\b/);
          if (yearMatch) {
            const year = parseInt(yearMatch[0]);
            if (year < params.year_min || year > params.year_max) continue;
          }

          listings.push({
            vin: null, // VIN usually on detail page
            title,
            price,
            url: listingUrl.startsWith('http') ? listingUrl : `https://www.autotrader.com${listingUrl}`,
            sourceSite: 'autotrader',
            location,
            mileage,
            status: 'active',
            salePrice: null,
            imageUrl,
          });
        } catch (err) {
          // Skip individual listing errors
        }
      }

      pagesScraped++;

      // Try to go to next page
      if (pagesScraped < maxPages) {
        const nextButton = await page.$('button[aria-label="Next"], [data-cmp="nextPage"]');
        if (nextButton) {
          await nextButton.click();
          await randomDelay(2000, 4000);
          await page.waitForLoadState('domcontentloaded').catch(() => {});
        } else {
          break;
        }
      }
    }

    await browser.close();
  } catch (err) {
    console.error(`[Autotrader] Scrape error:`, err);
  }

  console.log(`[Autotrader] Found ${listings.length} listings`);
  return listings;
}
