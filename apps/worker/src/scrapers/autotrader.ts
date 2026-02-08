import { ScrapedListing, SearchParams } from './types';
import { withRetry, randomDelay } from '../utils/retry';
import { extractVins, extractVinsInPlace } from '../utils/vin-extractor';

// Autotrader uses Akamai Bot Manager — requires either:
// 1. Bright Data Scraping Browser (recommended): set BRIGHT_DATA_BROWSER_WS
// 2. Stealth plugin + residential proxy (fallback): set PROXY_URL

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

function parseProxyUrl(): { server: string; username?: string; password?: string } | null {
  const proxyUrl = process.env.PROXY_URL;
  if (!proxyUrl) return null;

  try {
    const parsed = new URL(proxyUrl);
    const server = `${parsed.protocol}//${parsed.hostname}:${parsed.port}`;
    const result: { server: string; username?: string; password?: string } = { server };
    if (parsed.username) result.username = decodeURIComponent(parsed.username);
    if (parsed.password) result.password = decodeURIComponent(parsed.password);
    return result;
  } catch {
    console.error(`[Autotrader] Invalid PROXY_URL format: ${proxyUrl}`);
    return null;
  }
}

export async function scrapeAutotrader(params: SearchParams): Promise<ScrapedListing[]> {
  const url = buildSearchUrl(params);
  console.log(`[Autotrader] Scraping: ${url}`);

  const listings: ScrapedListing[] = [];
  const sbWs = process.env.BRIGHT_DATA_BROWSER_WS;

  let browser;
  try {
    let page;

    if (sbWs) {
      // Bright Data Scraping Browser — handles Akamai/bot detection automatically
      console.log(`[Autotrader] Connecting to Bright Data Scraping Browser...`);
      const { chromium } = await import('playwright');
      browser = await chromium.connectOverCDP(sbWs);
      page = await browser.newPage();
      console.log(`[Autotrader] Connected to Scraping Browser`);
    } else {
      // Fallback: stealth plugin + residential proxy
      const proxy = parseProxyUrl();
      if (!proxy) {
        console.log(`[Autotrader] No BRIGHT_DATA_BROWSER_WS or PROXY_URL configured — Autotrader requires anti-bot bypass. Skipping.`);
        return [];
      }

      console.log(`[Autotrader] Using proxy: ${proxy.server}`);
      const { chromium } = await import('playwright-extra');
      const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
      chromium.use(StealthPlugin());

      browser = await chromium.launch({
        headless: true,
        proxy: { server: proxy.server, username: proxy.username, password: proxy.password },
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
        ],
      });

      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
      });

      page = await context.newPage();

      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      });
    }

    // Navigate — Scraping Browser needs longer timeout for challenge solving
    const navTimeout = sbWs ? 120000 : 60000;
    await withRetry(async () => {
      await page.goto(url, { waitUntil: 'load', timeout: navTimeout });
    });

    // Quick check: if proxy returned an empty page, bail out early
    const htmlLength = await page.evaluate(() => document.documentElement?.outerHTML?.length || 0);
    if (htmlLength < 200) {
      console.log(`[Autotrader] Empty/blocked page (${htmlLength} chars). Skipping.`);
      await browser.close();
      browser = null;
      return [];
    }

    // Wait for JS to render — proxy adds latency
    await page.waitForLoadState('networkidle').catch(() => {});
    await randomDelay(3000, 5000);

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
      // Diagnostic: log detailed page info
      const pageTitle = await page.title();
      const pageUrl = page.url();
      const diagnostics = await page.evaluate(() => {
        const html = document.documentElement?.outerHTML || '';
        const scripts = document.querySelectorAll('script');
        const bodyText = document.body?.innerText?.substring(0, 500) || '';
        return {
          htmlLength: html.length,
          htmlPreview: html.substring(0, 1000),
          scriptCount: scripts.length,
          bodyText,
        };
      });

      console.log(`[Autotrader] No listings found with any selector strategy`);
      console.log(`[Autotrader] Page title: "${pageTitle}"`);
      console.log(`[Autotrader] Current URL: ${pageUrl}`);
      console.log(`[Autotrader] HTML length: ${diagnostics.htmlLength} chars, ${diagnostics.scriptCount} script tags`);
      console.log(`[Autotrader] HTML preview: ${diagnostics.htmlPreview}`);
      console.log(`[Autotrader] Body text: "${diagnostics.bodyText}"`);

      // Check if it's a captcha/challenge page
      const combined = (diagnostics.bodyText + diagnostics.htmlPreview).toLowerCase();
      const hasCaptcha = combined.includes('captcha') ||
        combined.includes('verify') ||
        combined.includes('robot') ||
        combined.includes('challenge') ||
        combined.includes('unavailable') ||
        combined.includes('incident');

      if (hasCaptcha) {
        console.log(`[Autotrader] Bot detection page detected — proxy may not be residential or may be rate-limited`);
      }

      // Last resort: try to find any links to vehicle detail pages
      const vehicleLinks = await page.$$('a[href*="/cars-for-sale/vehicledetails"]');
      console.log(`[Autotrader] Found ${vehicleLinks.length} vehicle detail links as fallback`);

      if (vehicleLinks.length > 0) {
        for (const link of vehicleLinks) {
          try {
            const href = await link.evaluate((el: Element) => (el as HTMLAnchorElement).href);
            const cardText = await link.evaluate((el: Element) => {
              const card = el.closest('div[class*="listing"], div[class*="inventory"], div[class*="vehicle"], section, article') || el.parentElement?.parentElement;
              return card?.textContent?.trim() || el.textContent?.trim() || '';
            });

            if (!href || !cardText) continue;

            const titleMatch = cardText.match(/(\d{4}\s+\w[\w\s]*(?:AWD|RWD|FWD|4WD)?)/i);
            const title = titleMatch ? titleMatch[1].trim() : cardText.split('\n')[0]?.trim() || '';
            if (!title) continue;

            const priceMatch = cardText.match(/\$\s*([\d,]+)/);
            const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) * 100 : 0;

            const mileageMatch = cardText.match(/([\d,]+)\s*mi/i);
            const mileage = mileageMatch ? parseInt(mileageMatch[1].replace(/,/g, '')) : null;

            const yearMatch = title.match(/\b(19|20)\d{2}\b/);
            if (yearMatch) {
              const year = parseInt(yearMatch[0]);
              if (year < params.year_min || year > params.year_max) continue;
            }

            const imageUrl = await link.evaluate((el: Element) => {
              const card = el.closest('div[class*="listing"], div[class*="inventory"], div[class*="vehicle"], section, article') || el.parentElement?.parentElement;
              const img = card?.querySelector('img');
              return img?.src || null;
            });

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

        if (pagesScraped < maxPages) {
          const nextButton = await page.$('button[aria-label="Next"], [data-cmp="nextPage"], a[aria-label="Next"]');
          if (nextButton) {
            try {
              await nextButton.click({ timeout: 5000 });
              await randomDelay(2000, 4000);
              await page.waitForLoadState('networkidle').catch(() => {});
            } catch {
              console.log(`[Autotrader] Pagination failed, continuing with ${listings.length} listings`);
              break;
            }
          } else {
            break;
          }
        }
      }
    }

    // Extract VINs from detail pages
    // CDP connections (Bright Data) don't support context.newPage(), so reuse the existing page
    if (sbWs) {
      await extractVinsInPlace(page, listings, 'Autotrader');
    } else {
      await extractVins(page.context(), listings, 'Autotrader');
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
