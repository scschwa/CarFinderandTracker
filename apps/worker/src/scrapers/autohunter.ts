import { ScrapedListing, SearchParams } from './types';
import { withRetry, randomDelay } from '../utils/retry';
import { extractVins } from '../utils/vin-extractor';
import { getAuctionResult, extractSalePrice, isSoldWithinThreeMonths } from '../utils/auction-helpers';

function buildSearchUrl(params: SearchParams): string {
  const query = `${params.make} ${params.model}${params.trim ? ' ' + params.trim : ''}`;
  return `https://www.autohunter.com/search?q=${encodeURIComponent(query)}`;
}

export async function scrapeAutohunter(params: SearchParams): Promise<ScrapedListing[]> {
  const url = buildSearchUrl(params);
  console.log(`[AutoHunter] Scraping: ${url}`);

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
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    });

    // Wait for JS rendering with a shorter networkidle timeout
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await randomDelay(2000, 3000);

    // Try multiple selectors for auction listing cards
    const selectorStrategies = [
      '.auction-card',
      '.vehicle-card',
      '[class*="auction-item"]',
      '[class*="listing-card"]',
      '[class*="vehicle-listing"]',
      'a[href*="/auction/"]',
      'a[href*="/lot/"]',
      'article',
    ];

    let cards: Awaited<ReturnType<typeof page.$$>> = [];
    let usedSelector = '';

    for (const selector of selectorStrategies) {
      // Try without waiting first (content may already be loaded)
      cards = await page.$$(selector);
      if (cards.length > 0) {
        usedSelector = selector;
        break;
      }
      // Short wait as fallback
      await page.waitForSelector(selector, { timeout: 2000 }).catch(() => {});
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

      console.log(`[AutoHunter] No listings found with any selector strategy`);
      console.log(`[AutoHunter] Page title: "${pageTitle}"`);
      console.log(`[AutoHunter] HTML length: ${diagnostics.htmlLength} chars`);
      console.log(`[AutoHunter] Body text: "${diagnostics.bodyText}"`);
      console.log(`[AutoHunter] HTML preview: ${diagnostics.htmlPreview}`);

      // Fallback: try any links to auction/lot detail pages
      const auctionLinks = await page.$$('a[href*="/auction/"], a[href*="/lot/"]');
      console.log(`[AutoHunter] Found ${auctionLinks.length} auction links as fallback`);

      for (const link of auctionLinks) {
        try {
          const href = await link.evaluate((el: Element) => (el as HTMLAnchorElement).href);
          const text = await link.evaluate((el: Element) => {
            const parent = el.closest('div, li, article, section') || el.parentElement;
            return parent?.textContent?.trim() || el.textContent?.trim() || '';
          });

          if (!href || !text || href === url) continue;

          const auctionResult = getAuctionResult(text);
          if (auctionResult === 'no-sale') {
            skippedClosed++;
            continue;
          }
          if (auctionResult === 'sold' && !isSoldWithinThreeMonths(text)) {
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

          const isSold = auctionResult === 'sold';
          const salePrice = isSold ? (extractSalePrice(text) || price) : null;

          listings.push({
            vin: null,
            title,
            price: isSold ? (salePrice || price) : price,
            url: href,
            sourceSite: 'autohunter',
            location: '',
            mileage: null,
            status: isSold ? 'sold' : 'active',
            salePrice,
            imageUrl: null,
          });
        } catch {
          // skip
        }
      }
    } else {
      console.log(`[AutoHunter] Found ${cards.length} cards using selector: ${usedSelector}`);

      for (const card of cards) {
        try {
          const cardText = await card.evaluate((el: Element) => el.textContent || '');

          const auctionResult = getAuctionResult(cardText);
          if (auctionResult === 'no-sale') {
            skippedClosed++;
            continue;
          }
          if (auctionResult === 'sold' && !isSoldWithinThreeMonths(cardText)) {
            skippedClosed++;
            continue;
          }

          let title = await card
            .$eval(
              'h2, h3, h4, [class*="title"], .listing-title, .vehicle-title',
              (el: Element) => el.textContent?.trim() || ''
            )
            .catch(() => '');

          // Fallback: use the card's own text content
          if (!title) {
            const firstLine = cardText.split('\n').map(l => l.trim()).find(l => l.length > 5);
            title = firstLine || cardText.trim().substring(0, 100);
          }

          if (!title) continue;

          let listingUrl = '';
          const tagName = await card.evaluate((el: Element) => el.tagName.toLowerCase());
          if (tagName === 'a') {
            listingUrl = await card.evaluate((el: Element) => (el as HTMLAnchorElement).href);
          } else {
            listingUrl = await card
              .$eval(
                'a[href*="/auction/"], a[href*="/lot/"], a[href*="/vehicle/"]',
                (el: Element) => (el as HTMLAnchorElement).href
              )
              .catch(() => '');
          }

          if (!listingUrl || listingUrl === 'https://www.autohunter.com' || listingUrl === 'https://www.autohunter.com/') continue;

          const priceText = await card
            .$eval(
              '[class*="price"], [class*="bid"], .current-bid, .high-bid',
              (el: Element) => el.textContent?.trim() || ''
            )
            .catch(() => '');

          const priceMatch = priceText.match(/\$?([\d,]+)/);
          const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) * 100 : 0;

          const imageUrl = await card
            .$eval('img', (el: Element) => (el as HTMLImageElement).src || '')
            .catch(() => null);

          const mileageMatch = cardText.match(/([\d,]+)\s*mi/i);
          const mileage = mileageMatch ? parseInt(mileageMatch[1].replace(/,/g, '')) : null;

          const yearMatch = title.match(/\b(19|20)\d{2}\b/);
          if (yearMatch) {
            const year = parseInt(yearMatch[0]);
            if (year < params.year_min || year > params.year_max) continue;
          }

          if (listings.some(l => l.url === listingUrl)) continue;

          const isSold = auctionResult === 'sold';
          const salePrice = isSold ? (extractSalePrice(cardText) || price) : null;

          listings.push({
            vin: null,
            title,
            price: isSold ? (salePrice || price) : price,
            url: listingUrl.startsWith('http') ? listingUrl : `https://www.autohunter.com${listingUrl}`,
            sourceSite: 'autohunter',
            location: '',
            mileage,
            status: isSold ? 'sold' : 'active',
            salePrice,
            imageUrl: imageUrl || null,
          });
        } catch {
          // skip
        }
      }
    }

    // Extract VINs from detail pages (opens new tabs, max 10)
    await extractVins(page.context(), listings, 'AutoHunter');

    await browser.close();
    browser = null;
  } catch (err) {
    console.error(`[AutoHunter] Scrape error:`, err);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  const soldCount = listings.filter(l => l.status === 'sold').length;
  const activeCount = listings.length - soldCount;
  console.log(`[AutoHunter] Found ${listings.length} listings (${activeCount} active, ${soldCount} sold, skipped ${skippedClosed} closed)`);
  return listings;
}
