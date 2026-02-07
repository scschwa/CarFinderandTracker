import { ScrapedListing, SearchParams } from './types';
import { withRetry, randomDelay } from '../utils/retry';

function buildSearchUrl(params: SearchParams): string {
  const query = `${params.make} ${params.model}${params.trim ? ' ' + params.trim : ''}`;
  return `https://www.pcarmarket.com/search/?q=${encodeURIComponent(query)}`;
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

export async function scrapePcarmarket(params: SearchParams): Promise<ScrapedListing[]> {
  const url = buildSearchUrl(params);
  console.log(`[PCARMARKET] Scraping: ${url}`);

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

    // Try multiple selectors for auction listing cards
    const selectorStrategies = [
      '.auction-card',
      '.auction-item',
      '[class*="auction"]',
      '.listing-card',
      '.vehicle-card',
      'a[href*="/auction/"]',
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

      console.log(`[PCARMARKET] No listings found with any selector strategy`);
      console.log(`[PCARMARKET] Page title: "${pageTitle}"`);
      console.log(`[PCARMARKET] HTML length: ${diagnostics.htmlLength} chars`);
      console.log(`[PCARMARKET] Body text: "${diagnostics.bodyText}"`);
      console.log(`[PCARMARKET] HTML preview: ${diagnostics.htmlPreview}`);

      // Fallback: try any links to auction detail pages
      const auctionLinks = await page.$$('a[href*="/auction/"], a[href*="/listing/"]');
      console.log(`[PCARMARKET] Found ${auctionLinks.length} auction links as fallback`);

      for (const link of auctionLinks) {
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
            sourceSite: 'pcarmarket',
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
      console.log(`[PCARMARKET] Found ${cards.length} cards using selector: ${usedSelector}`);

      for (const card of cards) {
        try {
          const cardText = await card.evaluate((el: Element) => el.textContent || '');

          if (isAuctionClosed(cardText)) {
            skippedClosed++;
            continue;
          }

          const title = await card
            .$eval(
              'h2, h3, h4, [class*="title"], .auction-title',
              (el: Element) => el.textContent?.trim() || ''
            )
            .catch(() => '');

          if (!title) continue;

          let listingUrl = '';
          const tagName = await card.evaluate((el: Element) => el.tagName.toLowerCase());
          if (tagName === 'a') {
            listingUrl = await card.evaluate((el: Element) => (el as HTMLAnchorElement).href);
          } else {
            listingUrl = await card
              .$eval('a[href*="/auction/"], a', (el: Element) => (el as HTMLAnchorElement).href)
              .catch(() => '');
          }

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
            url: listingUrl.startsWith('http') ? listingUrl : `https://www.pcarmarket.com${listingUrl}`,
            sourceSite: 'pcarmarket',
            location: '',
            mileage: null,
            status: 'active',
            salePrice: null,
            imageUrl: imageUrl || null,
          });
        } catch {
          // skip
        }
      }
    }

    await browser.close();
    browser = null;
  } catch (err) {
    console.error(`[PCARMARKET] Scrape error:`, err);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  console.log(`[PCARMARKET] Found ${listings.length} active listings (skipped ${skippedClosed} closed auctions)`);
  return listings;
}
