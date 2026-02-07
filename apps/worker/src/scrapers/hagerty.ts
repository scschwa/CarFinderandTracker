import { ScrapedListing, SearchParams } from './types';
import { withRetry, randomDelay } from '../utils/retry';
import { extractVin } from '../utils/vin-extractor';

// Hagerty Marketplace is a Next.js SSR app with Apollo GraphQL state.
// Search URL: /marketplace/search?q={query}&type=auctions&forSale=true
// Listings link to: /marketplace/auction/{year}-{make}-{model}/{uuid}

function buildSearchUrl(params: SearchParams): string {
  const query = `${params.make} ${params.model}${params.trim ? ' ' + params.trim : ''}`;
  return `https://www.hagerty.com/marketplace/search?q=${encodeURIComponent(query)}&type=auctions&forSale=true`;
}

function isAuctionClosed(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('sold') ||
    lower.includes('completed') ||
    lower.includes('ended') ||
    lower.includes('final bid') ||
    lower.includes('closed') ||
    lower.includes('no sale') ||
    lower.includes('reserve not met') ||
    lower.includes('auction ended')
  );
}

export async function scrapeHagerty(params: SearchParams): Promise<ScrapedListing[]> {
  const url = buildSearchUrl(params);
  console.log(`[Hagerty] Scraping: ${url}`);

  const listings: ScrapedListing[] = [];
  let skippedClosed = 0;

  let browser;
  try {
    const { chromium } = await import('playwright');

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();

    await withRetry(async () => {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    });

    await randomDelay(2000, 3000);

    // Try multiple selectors for listing cards
    const selectorStrategies = [
      'a[href*="/marketplace/auction/"]',
      '[class*="auction-card"]',
      '[class*="listing-card"]',
      '[class*="VehicleCard"]',
      '[class*="vehicle-card"]',
      'article',
    ];

    let cards: Awaited<ReturnType<typeof page.$$>> = [];
    let usedSelector = '';

    for (const selector of selectorStrategies) {
      await page.waitForSelector(selector, { timeout: 5000 }).catch(() => {});
      cards = await page.$$(selector);
      if (cards.length > 0) {
        usedSelector = selector;
        break;
      }
    }

    if (cards.length === 0) {
      // Diagnostics
      const pageTitle = await page.title();
      const diagnostics = await page.evaluate(() => {
        const html = document.documentElement?.outerHTML || '';
        const bodyText = document.body?.innerText?.substring(0, 500) || '';
        return {
          htmlLength: html.length,
          htmlPreview: html.substring(0, 1000),
          bodyText,
        };
      });

      console.log(`[Hagerty] No listings found with any selector strategy`);
      console.log(`[Hagerty] Page title: "${pageTitle}"`);
      console.log(`[Hagerty] HTML length: ${diagnostics.htmlLength} chars`);
      console.log(`[Hagerty] Body text: "${diagnostics.bodyText}"`);
      console.log(`[Hagerty] HTML preview: ${diagnostics.htmlPreview}`);
    } else {
      console.log(`[Hagerty] Found ${cards.length} cards using selector: ${usedSelector}`);

      for (const card of cards) {
        try {
          const cardText = await card.evaluate((el: Element) => el.textContent || '');

          if (isAuctionClosed(cardText)) {
            skippedClosed++;
            continue;
          }

          // Title: Hagerty uses descriptive titles like "23k-Mile 1989 Ford F-150 XLT Lariat"
          const title = await card
            .$eval(
              'h2, h3, h4, [class*="title"], [class*="Title"]',
              (el: Element) => el.textContent?.trim() || ''
            )
            .catch(() => cardText.split('\n').find(line => line.trim().match(/\b(19|20)\d{2}\b/))?.trim() || '');

          if (!title) continue;

          // URL from the card link
          let listingUrl = '';
          const tagName = await card.evaluate((el: Element) => el.tagName.toLowerCase());
          if (tagName === 'a') {
            listingUrl = await card.evaluate((el: Element) => (el as HTMLAnchorElement).href);
          } else {
            listingUrl = await card
              .$eval(
                'a[href*="/marketplace/auction/"], a',
                (el: Element) => (el as HTMLAnchorElement).href
              )
              .catch(() => '');
          }

          // Price / bid — Hagerty shows "Bid $X,XXX"
          const priceText = await card
            .$eval(
              '[class*="bid"], [class*="Bid"], [class*="price"], [class*="Price"]',
              (el: Element) => el.textContent?.trim() || ''
            )
            .catch(() => '');

          let price = 0;
          const priceMatch = priceText.match(/\$\s*([\d,]+)/);
          if (priceMatch) {
            price = parseInt(priceMatch[1].replace(/,/g, '')) * 100;
          } else {
            // Try extracting price from the full card text
            const cardPriceMatch = cardText.match(/(?:bid|price)\s*\$\s*([\d,]+)/i);
            if (cardPriceMatch) {
              price = parseInt(cardPriceMatch[1].replace(/,/g, '')) * 100;
            }
          }

          // Image from imgix CDN or regular img
          const imageUrl = await card
            .$eval('img', (el: Element) => (el as HTMLImageElement).src || '')
            .catch(() => null);

          // Mileage — Hagerty often includes mileage in the title like "23k-Mile"
          let mileage: number | null = null;
          const mileageKMatch = title.match(/([\d,.]+)k-mile/i);
          const mileageFullMatch = title.match(/([\d,]+)-mile/i);
          if (mileageKMatch) {
            mileage = Math.round(parseFloat(mileageKMatch[1].replace(/,/g, '')) * 1000);
          } else if (mileageFullMatch) {
            mileage = parseInt(mileageFullMatch[1].replace(/,/g, ''));
          }

          // Filter by year range
          const yearMatch = title.match(/\b(19|20)\d{2}\b/);
          if (yearMatch) {
            const year = parseInt(yearMatch[0]);
            if (year < params.year_min || year > params.year_max) continue;
          }

          if (listings.some(l => l.url === listingUrl)) continue;

          listings.push({
            vin: null,
            title,
            price,
            url: listingUrl.startsWith('http') ? listingUrl : `https://www.hagerty.com${listingUrl}`,
            sourceSite: 'hagerty',
            location: '',
            mileage,
            status: 'active',
            salePrice: null,
            imageUrl: imageUrl || null,
          });
        } catch {
          // skip
        }
      }
    }

    // Extract VINs from detail pages
    for (const listing of listings) {
      if (!listing.url) continue;
      try {
        const vin = await extractVin(page, listing.url);
        if (vin) {
          listing.vin = vin;
          console.log(`[Hagerty] Found VIN: ${vin} for ${listing.title}`);
        }
        await randomDelay(1000, 2000);
      } catch {
        // skip VIN extraction errors
      }
    }

    await browser.close();
    browser = null;
  } catch (err) {
    console.error(`[Hagerty] Scrape error:`, err);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  console.log(`[Hagerty] Found ${listings.length} active listings (skipped ${skippedClosed} closed auctions)`);
  return listings;
}
