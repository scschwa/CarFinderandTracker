import { ScrapedListing, SearchParams } from './types';
import { withRetry, randomDelay } from '../utils/retry';
import { extractVins } from '../utils/vin-extractor';

function buildSearchUrl(params: SearchParams): string {
  const query = `${params.make} ${params.model}${params.trim ? ' ' + params.trim : ''}`;
  const encoded = encodeURIComponent(query);
  return `https://bringatrailer.com/search/?s=${encoded}`;
}

/** Check if card text indicates a completed/closed auction.
 *  Uses specific phrases to avoid false positives from generic words. */
function isAuctionClosed(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /sold\s+for\s+\$/.test(lower) ||
    lower.includes('final bid') ||
    lower.includes('no sale') ||
    lower.includes('reserve not met') ||
    lower.includes('auction ended')
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
    });

    // Give Knockout.js a moment to finish binding
    await randomDelay(2000, 3000);

    // Try multiple selectors — BaT uses Knockout.js and may change markup
    const selectorStrategies = [
      'a.listing-card',
      '.auctions-item',
      '.auction-item',
      '[class*="listing-card"]',
      'a[href*="/listing/"]',
      '[class*="search-result"]',
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

      console.log(`[BaT] No listings found with any selector strategy`);
      console.log(`[BaT] Page title: "${pageTitle}"`);
      console.log(`[BaT] HTML length: ${diagnostics.htmlLength} chars`);
      console.log(`[BaT] Body text: "${diagnostics.bodyText}"`);
      console.log(`[BaT] HTML preview: ${diagnostics.htmlPreview}`);

      // Fallback: try any links to listing detail pages
      const listingLinks = await page.$$('a[href*="/listing/"], a[href*="bringatrailer.com/listing"]');
      console.log(`[BaT] Found ${listingLinks.length} listing links as fallback`);

      for (const link of listingLinks) {
        try {
          const href = await link.evaluate((el: Element) => (el as HTMLAnchorElement).href);
          const text = await link.evaluate((el: Element) => {
            const parent = el.closest('div, li, article, section') || el.parentElement;
            return parent?.textContent?.trim() || el.textContent?.trim() || '';
          });

          if (!href || !text || href === url) continue;
          if (isAuctionClosed(text)) {
            skippedClosed++;
            continue;
          }

          const yearMatch = text.match(/\b(19|20)\d{2}\b/);
          if (yearMatch) {
            const year = parseInt(yearMatch[0]);
            if (year < params.year_min || year > params.year_max) continue;
          }

          const titleMatch = text.match(/(\d{4}\s+[\w\s-]+)/i);
          const title = titleMatch ? titleMatch[1].trim() : text.split('\n')[0]?.trim() || '';
          if (!title) continue;

          const priceMatch = text.match(/\$\s*([\d,]+)/);
          const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) * 100 : 0;

          if (listings.some(l => l.url === href)) continue;

          listings.push({
            vin: null,
            title,
            price,
            url: href,
            sourceSite: 'bat',
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
      console.log(`[BaT] Found ${cards.length} cards using selector: ${usedSelector}`);

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
            .$eval(
              'h2, h3, h4, [class*="title"]',
              (el: Element) => el.textContent?.trim() || ''
            )
            .catch(() => '');

          if (!title) continue;

          // Link URL from the card itself (it's an <a> element) or nested link
          let listingUrl = '';
          const tagName = await card.evaluate((el: Element) => el.tagName.toLowerCase());
          if (tagName === 'a') {
            listingUrl = await card.evaluate(
              (el: Element) => (el as HTMLAnchorElement).href
            );
          } else {
            listingUrl = await card
              .$eval(
                'a[href*="/listing/"], a',
                (el: Element) => (el as HTMLAnchorElement).href
              )
              .catch(() => '');
          }

          if (!listingUrl) continue;

          // Price / bid from .bid-formatted.bold or any bid span
          const priceText = await card
            .$eval(
              '.bid-formatted.bold, .bidding-bid span, [class*="bid-formatted"], [class*="price"], [class*="bid"]',
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

          if (listings.some(l => l.url === listingUrl)) continue;

          listings.push({
            vin: null,
            title,
            price,
            url: listingUrl.startsWith('http') ? listingUrl : `https://bringatrailer.com${listingUrl}`,
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
    }

    // Extract VINs from detail pages (opens new tabs, max 10)
    await extractVins(page.context(), listings, 'BaT');

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
