import { ScrapedListing, SearchParams } from './types';
import { withRetry, randomDelay } from '../utils/retry';

function buildSearchUrl(params: SearchParams): string {
  const make = params.make.toLowerCase().replace(/\s+/g, '-');
  const model = params.trim
    ? `${params.model} ${params.trim}`.toLowerCase().replace(/\s+/g, '-')
    : params.model.toLowerCase().replace(/\s+/g, '-');
  return `https://www.autotempest.com/results?localization=country&make=${encodeURIComponent(make)}&maxyear=${params.year_max}&minyear=${params.year_min}&model=${encodeURIComponent(model)}&zip=20016`;
}

export async function scrapeAutotempest(params: SearchParams): Promise<ScrapedListing[]> {
  const url = buildSearchUrl(params);
  console.log(`[AutoTempest] Scraping: ${url}`);

  const listings: ScrapedListing[] = [];

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

    // AutoTempest loads results dynamically via JS — wait for content
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await randomDelay(3000, 5000);

    // Try multiple selectors for listing cards
    const selectorStrategies = [
      '.result-list-item',
      '.search-result',
      '[class*="result-item"]',
      '[class*="listing-item"]',
      'li[class*="result"]',
    ];

    let cards: Awaited<ReturnType<typeof page.$$>> = [];
    let usedSelector = '';

    for (const selector of selectorStrategies) {
      cards = await page.$$(selector);
      if (cards.length > 0) {
        usedSelector = selector;
        break;
      }
      await page.waitForSelector(selector, { timeout: 3000 }).catch(() => {});
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

      console.log(`[AutoTempest] No listings found with any selector strategy`);
      console.log(`[AutoTempest] Page title: "${pageTitle}"`);
      console.log(`[AutoTempest] HTML length: ${diagnostics.htmlLength} chars`);
      console.log(`[AutoTempest] Body text: "${diagnostics.bodyText}"`);
      console.log(`[AutoTempest] HTML preview: ${diagnostics.htmlPreview}`);

      // Fallback: try any links that look like external listing links
      const allLinks = await page.$$('a[target="_blank"][href*="http"]');
      console.log(`[AutoTempest] Found ${allLinks.length} external links as fallback`);

      for (const link of allLinks) {
        try {
          const href = await link.evaluate((el: Element) => (el as HTMLAnchorElement).href);
          const text = await link.evaluate((el: Element) => {
            const parent = el.closest('div, li, article, section') || el.parentElement;
            return parent?.textContent?.trim() || el.textContent?.trim() || '';
          });

          if (!href || !text || href.includes('autotempest.com')) continue;

          const yearMatch = text.match(/\b(19|20)\d{2}\b/);
          if (yearMatch) {
            const year = parseInt(yearMatch[0]);
            if (year < params.year_min || year > params.year_max) continue;
          }

          const titleMatch = text.match(/(\d{4}\s+[\w\s-]+)/i);
          const title = titleMatch ? titleMatch[1].trim() : text.split('\n')[0]?.trim() || '';
          if (!title || title.length < 5) continue;

          const priceMatch = text.match(/\$\s*([\d,]+)/);
          const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) * 100 : 0;

          if (listings.some(l => l.url === href)) continue;

          listings.push({
            vin: null,
            title,
            price,
            url: href,
            sourceSite: 'autotempest',
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
      console.log(`[AutoTempest] Found ${cards.length} cards using selector: ${usedSelector}`);

      for (const card of cards) {
        try {
          const cardText = await card.evaluate((el: Element) => el.textContent || '');

          // Title: from .listing-title a, a.source-link, or heading elements
          let title = await card
            .$eval(
              '.listing-title a, a.source-link, h2 a, h3 a, [class*="title"] a',
              (el: Element) => el.textContent?.trim() || ''
            )
            .catch(() => '');

          if (!title) {
            title = await card
              .$eval(
                'h2, h3, h4, [class*="title"]',
                (el: Element) => el.textContent?.trim() || ''
              )
              .catch(() => '');
          }

          // Fallback: use first substantial line from card text
          if (!title) {
            const firstLine = cardText.split('\n').map(l => l.trim()).find(l => l.length > 5);
            title = firstLine || cardText.trim().substring(0, 100);
          }

          if (!title) continue;

          // URL: external link from a.source-link, a[target="_blank"], or any anchor
          let listingUrl = await card
            .$eval(
              'a.source-link[target="_blank"], a.listing-link[target="_blank"], a[target="_blank"][href*="http"]',
              (el: Element) => (el as HTMLAnchorElement).href
            )
            .catch(() => '');

          if (!listingUrl) {
            listingUrl = await card
              .$eval(
                'a[href*="http"]',
                (el: Element) => (el as HTMLAnchorElement).href
              )
              .catch(() => '');
          }

          // Skip if no URL or if it points back to autotempest
          if (!listingUrl || listingUrl.includes('autotempest.com/results')) continue;

          // Price from .label--price or price-related elements
          const priceText = await card
            .$eval(
              '.label--price, [class*="price"], [class*="Price"]',
              (el: Element) => el.textContent?.trim() || ''
            )
            .catch(() => '');

          let price = 0;
          const priceMatch = priceText.match(/\$?\s*([\d,]+)/);
          if (priceMatch) {
            price = parseInt(priceMatch[1].replace(/,/g, '')) * 100;
          } else {
            // Try extracting price from full card text
            const cardPriceMatch = cardText.match(/\$\s*([\d,]+)/);
            if (cardPriceMatch) {
              price = parseInt(cardPriceMatch[1].replace(/,/g, '')) * 100;
            }
          }

          // Image: from div.image[data-img] or regular img
          let imageUrl = await card
            .$eval('div.image[data-img]', (el: Element) => el.getAttribute('data-img') || '')
            .catch(() => '');

          if (!imageUrl) {
            imageUrl = await card
              .$eval('img', (el: Element) => (el as HTMLImageElement).src || '')
              .catch(() => '');
          }

          // Mileage
          const mileageText = await card
            .$eval('span.mileage, [class*="mileage"]', (el: Element) => el.textContent?.trim() || '')
            .catch(() => '');
          let mileage: number | null = null;
          const mileageMatch = mileageText.match(/([\d,]+)/);
          if (mileageMatch) {
            mileage = parseInt(mileageMatch[1].replace(/,/g, ''));
          }

          // Location
          const location = await card
            .$eval('span.location, .city, [class*="location"]', (el: Element) => el.textContent?.trim() || '')
            .catch(() => '');

          // Year filter
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
            url: listingUrl,
            sourceSite: 'autotempest',
            location: location || '',
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

    // No VIN extraction — detail pages are on external sites

    await browser.close();
    browser = null;
  } catch (err) {
    console.error(`[AutoTempest] Scrape error:`, err);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  console.log(`[AutoTempest] Found ${listings.length} listings`);
  return listings;
}
