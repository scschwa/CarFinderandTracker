import type { Page } from 'playwright';

const VIN_REGEX = /\b[A-HJ-NPR-Z0-9]{17}\b/;

export async function extractVin(page: Page, url: string): Promise<string | null> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Try specific VIN selectors first
    const selectors = [
      '[class*="vin"]',
      '[class*="Vin"]',
      '[data-vin]',
      '#vin-value',
      '[id*="vin"]',
      '[data-testid*="vin"]',
    ];

    for (const selector of selectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          const dataVin = await el.evaluate((e: Element) => e.getAttribute('data-vin') || '');
          if (dataVin) {
            const match = dataVin.match(VIN_REGEX);
            if (match) return match[0];
          }

          const text = await el.evaluate((e: Element) => e.textContent?.trim() || '');
          const match = text.match(VIN_REGEX);
          if (match) return match[0];
        }
      } catch {
        // skip selector
      }
    }

    // Fallback: search full body text
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    const match = bodyText.match(VIN_REGEX);
    if (match) return match[0];

    return null;
  } catch {
    return null;
  }
}
