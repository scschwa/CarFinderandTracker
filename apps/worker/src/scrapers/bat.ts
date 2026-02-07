import { ScrapedListing, SearchParams } from './types';
import { withRetry, randomDelay } from '../utils/retry';

function buildSearchUrl(params: SearchParams): string {
  const query = `${params.make} ${params.model}${params.trim ? ' ' + params.trim : ''}`;
  const encoded = encodeURIComponent(query);
  return `https://bringatrailer.com/search/?s=${encoded}`;
}

/** Check if card text indicates a completed/closed auction */
function isAuctionClosed(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('sold') ||
    lower.includes('completed') ||
    lower.includes('ended') ||
    lower.includes('final bid') ||
    lower.includes('closed') ||
    lower.includes('no sale') ||
    lower.includes('reserve not met')
  );
}

export async function scrapeBaT(params: SearchParams): Promise<ScrapedListing[]> {
  const url = buildSearchUrl(params);
  console.log(`[BaT] Scraping: ${url}`);

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
      // BaT uses Knockout.js — wait for listing cards to be rendered
      await page
        .waitForSelector('a.listing-card', { timeout: 10000 })
        .catch(() => {});
    });

    // Give Knockout.js a moment to finish binding
    await randomDelay(2000, 3000);

    const cards = await page.$$('a.listing-card');
    console.log(`[BaT] Found ${cards.length} cards on page`);

    for (const card of cards) {
      try {
        // Get full card text for sold/closed detection
        const cardText = await card.evaluate(
          (el: Element) => el.textContent || ''
        );

        // Skip closed/completed auctions
        if (isAuctionClosed(cardText)) {
          skippedClosed++;
          continue;
        }

        // Title from h3 inside the card
        const title = await card
          .$eval('h3', (el: Element) => el.textContent?.trim() || '')
          .catch(() => '');

        if (!title) continue;

        // Link URL from the card itself (it's an <a> element)
        const listingUrl = await card.evaluate(
          (el: Element) => (el as HTMLAnchorElement).href
        );

        if (!listingUrl) continue;

        // Price / bid from .bid-formatted.bold or any bid span
        const priceText = await card
          .$eval(
            '.bid-formatted.bold, .bidding-bid span, [class*="bid-formatted"]',
            (el: Element) => el.textContent?.trim() || ''
          )
          .catch(() => '');

        const priceMatch = priceText.match(/\$?([\d,]+)/);
        const price = priceMatch
          ? parseInt(priceMatch[1].replace(/,/g, '')) * 100
          : 0;

        // Image from thumbnail
        const imageUrl = await card
          .$eval(
            '.thumbnail img, img',
            (el: Element) => (el as HTMLImageElement).src || ''
          )
          .catch(() => null);

        // Filter by year range
        const yearMatch = title.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
          const year = parseInt(yearMatch[0]);
          if (year < params.year_min || year > params.year_max) continue;
        }

        listings.push({
          vin: null,
          title,
          price,
          url: listingUrl,
          sourceSite: 'bat',
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

    await browser.close();
    browser = null;
  } catch (err) {
    console.error(`[BaT] Scrape error:`, err);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  console.log(`[BaT] Found ${listings.length} active listings (skipped ${skippedClosed} closed auctions)`);
  return listings;
}
