import { ScrapedListing, SearchParams } from './types';
import { withRetry, randomDelay } from '../utils/retry';
import { extractVins } from '../utils/vin-extractor';

function buildSearchUrl(params: SearchParams): string {
  const query = `${params.make} ${params.model}${params.trim ? ' ' + params.trim : ''}`;
  return `https://carsandbids.com/search?q=${encodeURIComponent(query)}`;
}

/** Check if card text indicates a completed/closed auction.
 *  Uses specific phrases to avoid false positives from generic words
 *  like "sold" or "ended" appearing in non-status parts of the card. */
function isAuctionClosed(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /sold\s+for\s+(?:usd\s+)?\$/.test(lower) ||
    /bid\s+to\s+(?:usd\s+)?\$/.test(lower) ||
    lower.includes('final bid') ||
    lower.includes('no sale') ||
    lower.includes('reserve not met') ||
    lower.includes('auction ended')
  );
}

export async function scrapeCarsAndBids(params: SearchParams): Promise<ScrapedListing[]> {
  const url = buildSearchUrl(params);
  console.log(`[C&B] Scraping: ${url}`);

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
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    });

    // Wait for content to load — try multiple possible selectors
    const cardSelector = await Promise.race([
      page.waitForSelector('.auction-item', { timeout: 10000 }).then(() => '.auction-item'),
      page.waitForSelector('.auction-card', { timeout: 10000 }).then(() => '.auction-card'),
      page.waitForSelector('[class*="auction"]', { timeout: 10000 }).then(() => '[class*="auction"]'),
      page.waitForSelector('a[href*="/auctions/"]', { timeout: 10000 }).then(() => 'a[href*="/auctions/"]'),
    ]).catch(() => null);

    if (!cardSelector) {
      // Debug: log what's on the page
      const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
      console.log(`[C&B] No auction cards found. Page text preview: ${bodyText}`);

      // Try one more approach: look for any links to auctions
      const auctionLinks = await page.$$('a[href*="/auctions/"]');
      console.log(`[C&B] Found ${auctionLinks.length} auction links on page`);

      if (auctionLinks.length === 0) {
        await browser.close();
        browser = null;
        console.log(`[C&B] Found 0 listings (0 active, 0 skipped closed)`);
        return [];
      }

      // If we found auction links but not card containers, extract from links
      for (const link of auctionLinks) {
        try {
          const href = await link.evaluate((el: Element) => (el as HTMLAnchorElement).href);
          const text = await link.evaluate((el: Element) => el.textContent?.trim() || '');
          if (!href || !text || href === url) continue;

          // Get the parent element's full text for better context
          const parentText = await link.evaluate(
            (el: Element) => el.closest('div, li, article')?.textContent || el.textContent || ''
          );

          // Skip closed/completed auctions
          if (isAuctionClosed(parentText)) {
            skippedClosed++;
            continue;
          }

          const yearMatch = text.match(/\b(19|20)\d{2}\b/);
          if (yearMatch) {
            const year = parseInt(yearMatch[0]);
            if (year < params.year_min || year > params.year_max) continue;
          }

          listings.push({
            vin: null,
            title: text,
            price: 0,
            url: href,
            sourceSite: 'carsandbids',
            location: '',
            mileage: null,
            status: 'active',
            salePrice: null,
            imageUrl: null,
          });
        } catch {
          // skip
        }
      }
    } else {
      console.log(`[C&B] Using selector: ${cardSelector}`);
      await randomDelay(1000, 2000);

      const cards = await page.$$(cardSelector);
      console.log(`[C&B] Found ${cards.length} cards on page`);

      for (const card of cards) {
        try {
          // Get card full text for sold detection
          const cardText = await card.evaluate(
            (el: Element) => el.textContent || ''
          );

          // Skip closed/completed auctions
          if (isAuctionClosed(cardText)) {
            skippedClosed++;
            continue;
          }

          // Try multiple selectors for the title
          const title = await card
            .$eval(
              'h3, h2, .auction-title, [class*="title"]',
              (el: Element) => el.textContent?.trim() || ''
            )
            .catch(() => '');

          // Get link URL from card or nested anchor
          let listingUrl = '';
          const tagName = await card.evaluate((el: Element) => el.tagName.toLowerCase());

          if (tagName === 'a') {
            listingUrl = await card.evaluate(
              (el: Element) => (el as HTMLAnchorElement).href
            );
          } else {
            listingUrl = await card
              .$eval(
                'a[href*="/auctions/"], a',
                (el: Element) => (el as HTMLAnchorElement).href
              )
              .catch(() => '');
          }

          if (!title && !listingUrl) continue;

          // Price / bid
          const priceText = await card
            .$eval(
              '[class*="bid"], [class*="price"], .current-bid, .high-bid',
              (el: Element) => el.textContent?.trim() || ''
            )
            .catch(() => '');

          const priceMatch = priceText.match(/\$?([\d,]+)/);
          const price = priceMatch
            ? parseInt(priceMatch[1].replace(/,/g, '')) * 100
            : 0;

          // Image
          const imageUrl = await card
            .$eval('img', (el: Element) => (el as HTMLImageElement).src || '')
            .catch(() => null);

          // Filter by year range
          const displayTitle = title || listingUrl;
          const yearMatch = displayTitle.match(/\b(19|20)\d{2}\b/);
          if (yearMatch) {
            const year = parseInt(yearMatch[0]);
            if (year < params.year_min || year > params.year_max) continue;
          }

          listings.push({
            vin: null,
            title: title || listingUrl.split('/').pop() || 'Unknown',
            price,
            url: listingUrl.startsWith('http')
              ? listingUrl
              : `https://carsandbids.com${listingUrl}`,
            sourceSite: 'carsandbids',
            location: '',
            mileage: null,
            status: 'active',
            salePrice: null,
            imageUrl: imageUrl || null,
          });
        } catch {
          // Skip individual listing parse errors
        }
      }
    }

    // Extract VINs from detail pages (opens new tabs, max 10)
    await extractVins(page.context(), listings, 'C&B');

    await browser.close();
    browser = null;
  } catch (err) {
    console.error(`[C&B] Scrape error:`, err);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  console.log(`[C&B] Found ${listings.length} active listings (skipped ${skippedClosed} closed auctions)`);
  return listings;
}
