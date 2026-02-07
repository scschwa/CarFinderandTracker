import type { BrowserContext, Page } from 'playwright';

const VIN_REGEX = /\b[A-HJ-NPR-Z0-9]{17}\b/;
const MAX_VIN_EXTRACTIONS = 10;

async function findVinOnPage(page: Page): Promise<string | null> {
  const selectors = [
    '[class*="vin"]',
    '[class*="Vin"]',
    '[class*="VIN"]',
    '[data-vin]',
    '#vin-value',
    '[id*="vin"]',
    '[id*="VIN"]',
    '[data-testid*="vin"]',
  ];

  for (const selector of selectors) {
    try {
      const elements = await page.$$(selector);
      for (const el of elements) {
        const dataVin = await el.evaluate((e: Element) => e.getAttribute('data-vin') || '');
        if (dataVin) {
          const match = dataVin.match(VIN_REGEX);
          if (match) {
            console.log(`[VIN] Found via data-vin: ${match[0]}`);
            return match[0];
          }
        }

        const text = await el.evaluate((e: Element) => e.textContent?.trim() || '');
        const match = text.match(VIN_REGEX);
        if (match) {
          console.log(`[VIN] Found via selector "${selector}": ${match[0]}`);
          return match[0];
        }
      }
    } catch {
      // skip selector
    }
  }

  // Try page source HTML (catches VINs in hidden elements, meta tags, JSON-LD, etc.)
  const html = await page.content();
  const htmlMatch = html.match(VIN_REGEX);
  if (htmlMatch) {
    console.log(`[VIN] Found in page HTML: ${htmlMatch[0]}`);
    return htmlMatch[0];
  }

  return null;
}

/** Opens new tabs via BrowserContext — use for non-CDP scrapers */
export async function extractVins(
  context: BrowserContext,
  listings: { url: string; vin: string | null; title: string }[],
  scraperName: string,
): Promise<void> {
  let extracted = 0;
  for (const listing of listings) {
    if (extracted >= MAX_VIN_EXTRACTIONS) break;
    if (!listing.url || listing.vin) continue;

    let page: Page | null = null;
    try {
      page = await context.newPage();
      console.log(`[VIN] Navigating to: ${listing.url}`);
      await page.goto(listing.url, { waitUntil: 'load', timeout: 20000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));

      const vin = await findVinOnPage(page);
      if (vin) {
        listing.vin = vin;
        console.log(`[${scraperName}] VIN: ${vin} for ${listing.title}`);
      } else {
        console.log(`[VIN] No VIN found on: ${listing.url}`);
      }
    } catch (err) {
      console.log(`[VIN] Error on ${listing.url}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (page) await page.close().catch(() => {});
    }

    extracted++;
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
  }
  console.log(`[${scraperName}] VIN extraction: checked ${extracted} listings`);
}

/** Reuses an existing page for VIN extraction — use for CDP connections (Bright Data) */
export async function extractVinsInPlace(
  page: Page,
  listings: { url: string; vin: string | null; title: string }[],
  scraperName: string,
): Promise<void> {
  let extracted = 0;
  for (const listing of listings) {
    if (extracted >= MAX_VIN_EXTRACTIONS) break;
    if (!listing.url || listing.vin) continue;

    try {
      console.log(`[VIN] Navigating to: ${listing.url}`);
      await page.goto(listing.url, { waitUntil: 'load', timeout: 20000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));

      const vin = await findVinOnPage(page);
      if (vin) {
        listing.vin = vin;
        console.log(`[${scraperName}] VIN: ${vin} for ${listing.title}`);
      } else {
        console.log(`[VIN] No VIN found on: ${listing.url}`);
      }
    } catch (err) {
      console.log(`[VIN] Error on ${listing.url}: ${err instanceof Error ? err.message : String(err)}`);
    }

    extracted++;
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
  }
  console.log(`[${scraperName}] VIN extraction: checked ${extracted} listings`);
}
