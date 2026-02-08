import { ScrapedListing, SearchParams } from './types';
import { withRetry, randomDelay } from '../utils/retry';
import { extractVins } from '../utils/vin-extractor';

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

export async function scrapeHemmings(params: SearchParams): Promise<ScrapedListing[]> {
  const query = `${params.make} ${params.model}${params.trim ? ' ' + params.trim : ''}`;
  console.log(`[Hemmings] Searching for: ${query}`);

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

    // Navigate to homepage and use their search
    await withRetry(async () => {
      await page.goto('https://www.hemmings.com', { waitUntil: 'networkidle', timeout: 30000 });
    });

    await randomDelay(1000, 2000);

    // Find and use the search input
    const searchInput = await page.$('input[type="search"], input[name="q"], input[placeholder*="earch"], input[class*="search"], #search-input');
    let searchWorked = false;

    if (searchInput) {
      await searchInput.fill(query);
      await searchInput.press('Enter');
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await randomDelay(2000, 3000);

      // Check if search actually navigated us somewhere
      const currentUrl = page.url();
      if (currentUrl !== 'https://www.hemmings.com/' && currentUrl !== 'https://www.hemmings.com') {
        searchWorked = true;
        console.log(`[Hemmings] Search submitted, landed on: ${currentUrl}`);
      } else {
        // Enter didn't navigate — try clicking a search/submit button
        console.log(`[Hemmings] Search input Enter didn't navigate, trying submit button`);
        const submitBtn = await page.$('button[type="submit"], button[class*="search"], [class*="search-btn"], [class*="SearchButton"]');
        if (submitBtn) {
          await submitBtn.click();
          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
          await randomDelay(2000, 3000);
          const afterClickUrl = page.url();
          if (afterClickUrl !== 'https://www.hemmings.com/' && afterClickUrl !== 'https://www.hemmings.com') {
            searchWorked = true;
            console.log(`[Hemmings] Submit button worked, landed on: ${afterClickUrl}`);
          }
        }
      }
    }

    if (!searchWorked) {
      // Fallback: try direct URL patterns
      console.log(`[Hemmings] Search bar didn't work, trying direct URLs`);
      const urlAttempts = [
        `https://www.hemmings.com/classifieds/cars/for-sale?q=${encodeURIComponent(query)}`,
        `https://www.hemmings.com/auctions?q=${encodeURIComponent(query)}`,
        `https://www.hemmings.com/search?q=${encodeURIComponent(query)}`,
      ];

      for (const tryUrl of urlAttempts) {
        try {
          await page.goto(tryUrl, { waitUntil: 'networkidle', timeout: 15000 });
          const title = await page.title();
          const currentUrl = page.url();
          if (!title.includes('404') && currentUrl !== 'https://www.hemmings.com/' && currentUrl !== 'https://www.hemmings.com') {
            console.log(`[Hemmings] Using URL: ${tryUrl} → ${currentUrl}`);
            searchWorked = true;
            break;
          }
        } catch {
          // try next URL
        }
      }

      if (!searchWorked) {
        console.log(`[Hemmings] Could not find working search URL`);
        await browser.close();
        browser = null;
        return [];
      }

      await randomDelay(2000, 3000);
    }

    // Check for Cloudflare challenge page
    const cfCheck = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
    if (cfCheck.includes('Just a moment') || cfCheck.includes('Checking your browser') || cfCheck.includes('cf-browser-verification')) {
      console.log(`[Hemmings] Cloudflare challenge detected — cannot bypass without anti-bot service. Skipping.`);
      await browser.close();
      browser = null;
      return [];
    }

    // Try multiple selectors for listing cards
    const selectorStrategies = [
      '.auction-card',
      '.listing-card',
      '[class*="auction-item"]',
      '[class*="listing-item"]',
      '[class*="ListingCard"]',
      '[class*="vehicle-card"]',
      'a[href*="/auction/"]',
      'a[href*="/classifieds/"]',
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

      console.log(`[Hemmings] No listings found with any selector strategy`);
      console.log(`[Hemmings] Page title: "${pageTitle}"`);
      console.log(`[Hemmings] HTML length: ${diagnostics.htmlLength} chars`);
      console.log(`[Hemmings] Body text: "${diagnostics.bodyText}"`);
      console.log(`[Hemmings] HTML preview: ${diagnostics.htmlPreview}`);

      // Fallback: try any links to auction/listing detail pages
      const auctionLinks = await page.$$('a[href*="/auction/"], a[href*="/classifieds/cars/"], a[href*="/listing/"]');
      console.log(`[Hemmings] Found ${auctionLinks.length} listing links as fallback`);

      for (const link of auctionLinks) {
        try {
          const href = await link.evaluate((el: Element) => (el as HTMLAnchorElement).href);
          const text = await link.evaluate((el: Element) => {
            const parent = el.closest('div, li, article, section') || el.parentElement;
            return parent?.textContent?.trim() || el.textContent?.trim() || '';
          });

          if (!href || !text || href === page.url()) continue;

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
            sourceSite: 'hemmings',
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
      console.log(`[Hemmings] Found ${cards.length} cards using selector: ${usedSelector}`);

      for (const card of cards) {
        try {
          const cardText = await card.evaluate((el: Element) => el.textContent || '');

          if (isAuctionClosed(cardText)) {
            skippedClosed++;
            continue;
          }

          let title = await card
            .$eval(
              'h2, h3, h4, [class*="title"], .listing-title',
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
              .$eval('a[href*="/auction/"], a', (el: Element) => (el as HTMLAnchorElement).href)
              .catch(() => '');
          }

          const priceText = await card
            .$eval(
              '[class*="price"], [class*="bid"], .current-bid',
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
            url: listingUrl.startsWith('http') ? listingUrl : `https://www.hemmings.com${listingUrl}`,
            sourceSite: 'hemmings',
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

    // Extract VINs from detail pages (opens new tabs, max 10)
    await extractVins(page.context(), listings, 'Hemmings');

    await browser.close();
    browser = null;
  } catch (err) {
    console.error(`[Hemmings] Scrape error:`, err);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  console.log(`[Hemmings] Found ${listings.length} active listings (skipped ${skippedClosed} closed auctions)`);
  return listings;
}
