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

  let browser;
  try {
    // Dynamic import to avoid loading playwright when not scraping autotrader
    const { chromium } = await import('playwright');

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();

    await withRetry(async () => {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    });

    // Try multiple selectors — Autotrader may have changed their markup
    const selectorStrategies = [
      '[data-cmp="inventoryListing"]',
      '.inventory-listing',
      '[data-testid="inventory-listing"]',
      '[class*="inventoryListing"]',
      '[class*="inventory-listing"]',
      'div[id^="listing-"]',
    ];

    let items: Awaited<ReturnType<typeof page.$$>> = [];
    let usedSelector = '';

    for (const selector of selectorStrategies) {
      await page.waitForSelector(selector, { timeout: 5000 }).catch(() => {});
      items = await page.$$(selector);
      if (items.length > 0) {
        usedSelector = selector;
        break;
      }
    }

    if (items.length === 0) {
      // Diagnostic: log what's on the page
      const pageTitle = await page.title();
      const pageUrl = page.url();
      const bodyPreview = await page.evaluate(
        () => document.body?.innerText?.substring(0, 800) || ''
      );

      console.log(`[Autotrader] No listings found with any selector strategy`);
      console.log(`[Autotrader] Page title: ${pageTitle}`);
      console.log(`[Autotrader] Current URL: ${pageUrl}`);
      console.log(`[Autotrader] Body preview: ${bodyPreview.substring(0, 500)}`);

      // Check if it's a captcha/challenge page
      const hasCaptcha = bodyPreview.toLowerCase().includes('captcha') ||
        bodyPreview.toLowerCase().includes('verify') ||
        bodyPreview.toLowerCase().includes('robot') ||
        bodyPreview.toLowerCase().includes('challenge');

      if (hasCaptcha) {
        console.log(`[Autotrader] Bot detection/captcha page detected`);
      }

      // Last resort: try to find any links to vehicle detail pages
      const vehicleLinks = await page.$$('a[href*="/cars-for-sale/vehicledetails"]');
      console.log(`[Autotrader] Found ${vehicleLinks.length} vehicle detail links as fallback`);

      if (vehicleLinks.length > 0) {
        for (const link of vehicleLinks) {
          try {
            const href = await link.evaluate((el: Element) => (el as HTMLAnchorElement).href);
            // Get the closest parent that looks like a card
            const cardText = await link.evaluate((el: Element) => {
              const card = el.closest('div[class*="listing"], div[class*="inventory"], div[class*="vehicle"], section, article') || el.parentElement?.parentElement;
              return card?.textContent?.trim() || el.textContent?.trim() || '';
            });

            if (!href || !cardText) continue;

            // Extract title — typically first meaningful text
            const titleMatch = cardText.match(/(\d{4}\s+\w[\w\s]*(?:AWD|RWD|FWD|4WD)?)/i);
            const title = titleMatch ? titleMatch[1].trim() : cardText.split('\n')[0]?.trim() || '';

            if (!title) continue;

            // Extract price
            const priceMatch = cardText.match(/\$\s*([\d,]+)/);
            const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) * 100 : 0;

            // Extract mileage
            const mileageMatch = cardText.match(/([\d,]+)\s*mi/i);
            const mileage = mileageMatch ? parseInt(mileageMatch[1].replace(/,/g, '')) : null;

            // Filter by year
            const yearMatch = title.match(/\b(19|20)\d{2}\b/);
            if (yearMatch) {
              const year = parseInt(yearMatch[0]);
              if (year < params.year_min || year > params.year_max) continue;
            }

            // Get image from sibling elements
            const imageUrl = await link.evaluate((el: Element) => {
              const card = el.closest('div[class*="listing"], div[class*="inventory"], div[class*="vehicle"], section, article') || el.parentElement?.parentElement;
              const img = card?.querySelector('img');
              return img?.src || null;
            });

            // Deduplicate by URL
            if (listings.some(l => l.url === href)) continue;

            listings.push({
              vin: null,
              title,
              price,
              url: href,
              sourceSite: 'autotrader',
              location: '',
              mileage,
              status: 'active',
              salePrice: null,
              imageUrl,
            });
          } catch {
            // Skip individual link errors
          }
        }
      }
    } else {
      console.log(`[Autotrader] Found ${items.length} listings using selector: ${usedSelector}`);

      let pagesScraped = 0;
      const maxPages = 5;

      while (pagesScraped < maxPages) {
        const pageItems = await page.$$(usedSelector);

        for (const item of pageItems) {
          try {
            const title = await item.$eval(
              'h2, h3, [data-cmp="inventoryListingTitle"], .listing-title, [class*="title"]',
              (el: Element) => el.textContent?.trim() || ''
            ).catch(() => '');

            if (!title) continue;

            const listingUrl = await item.$eval(
              'a[href*="/cars-for-sale/vehicledetails"], a[href*="/cars-for-sale/"]',
              (el: Element) => (el as HTMLAnchorElement).href
            ).catch(() => '');

            const priceText = await item.$eval(
              '[data-cmp="firstPrice"], .first-price, .listing-price, [class*="price"]',
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
              '[class*="dealer-name"], .dealer-location, [class*="dealer"]',
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

            // Deduplicate
            if (listings.some(l => l.url === listingUrl)) continue;

            listings.push({
              vin: null,
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
          } catch {
            // Skip individual listing errors
          }
        }

        pagesScraped++;

        // Try to go to next page
        if (pagesScraped < maxPages) {
          const nextButton = await page.$('button[aria-label="Next"], [data-cmp="nextPage"], a[aria-label="Next"]');
          if (nextButton) {
            await nextButton.click();
            await randomDelay(2000, 4000);
            await page.waitForLoadState('networkidle').catch(() => {});
          } else {
            break;
          }
        }
      }
    }

    await browser.close();
    browser = null;
  } catch (err) {
    console.error(`[Autotrader] Scrape error:`, err);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  console.log(`[Autotrader] Found ${listings.length} listings`);
  return listings;
}
