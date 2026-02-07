import type { Page } from 'playwright';

const VIN_REGEX = /\b[A-HJ-NPR-Z0-9]{17}\b/;

export async function extractVin(page: Page, url: string): Promise<string | null> {
  try {
    console.log(`[VIN] Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 20000 });

    // Wait for JS to render content
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));

    // Try specific VIN selectors first
    const selectors = [
      '[class*="vin"]',
      '[class*="Vin"]',
      '[class*="VIN"]',
      '[data-vin]',
      '#vin-value',
      '[id*="vin"]',
      '[id*="VIN"]',
      '[data-testid*="vin"]',
      'td:has(+ td)',  // table cells that might contain VIN label/value pairs
    ];

    for (const selector of selectors) {
      try {
        const elements = await page.$$(selector);
        for (const el of elements) {
          const dataVin = await el.evaluate((e: Element) => e.getAttribute('data-vin') || '');
          if (dataVin) {
            const match = dataVin.match(VIN_REGEX);
            if (match) {
              console.log(`[VIN] Found via data-vin attribute: ${match[0]}`);
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

    // Fallback: search full visible body text
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    const bodyMatch = bodyText.match(VIN_REGEX);
    if (bodyMatch) {
      console.log(`[VIN] Found in body text: ${bodyMatch[0]}`);
      return bodyMatch[0];
    }

    console.log(`[VIN] No VIN found on: ${url}`);
    return null;
  } catch (err) {
    console.log(`[VIN] Error extracting from ${url}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
