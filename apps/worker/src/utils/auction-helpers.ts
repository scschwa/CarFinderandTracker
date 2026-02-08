/**
 * Shared helpers for auction-site scrapers.
 * Used by: bat, carsandbids, pcarmarket, hagerty, autohunter
 */

/**
 * Determines the auction result from card text.
 * - 'active'  → auction still running, include as active listing
 * - 'sold'    → sold/transacted, include as sold if recent
 * - 'no-sale' → reserve not met, no sale, ambiguous close → skip
 */
export function getAuctionResult(text: string): 'active' | 'sold' | 'no-sale' {
  const lower = text.toLowerCase();

  // Check for no-sale indicators first
  if (lower.includes('no sale') || lower.includes('reserve not met')) {
    return 'no-sale';
  }

  // Check for sold indicators: "sold for $X" or "sold after $X" (C&B post-auction sale)
  if (/sold\s+(?:for|after)\s+(?:usd\s+)?\$/.test(lower)) {
    return 'sold';
  }

  // "Bid to $X", "final bid", "auction ended" without a "sold" indicator
  // are ambiguous — treat as no-sale (reserve likely not met)
  if (
    /bid\s+to\s+(?:usd\s+)?\$/.test(lower) ||
    lower.includes('final bid') ||
    lower.includes('auction ended')
  ) {
    return 'no-sale';
  }

  return 'active';
}

/**
 * Extract the sale price from card text for sold auctions.
 * Matches "sold for $X" and "sold after $X".
 * Returns price in cents, or 0 if not found.
 */
export function extractSalePrice(text: string): number {
  const lower = text.toLowerCase();
  const soldMatch = lower.match(/sold\s+(?:for|after)\s+(?:usd\s+)?\$\s*([\d,]+)/);
  if (soldMatch) {
    return parseInt(soldMatch[1].replace(/,/g, '')) * 100;
  }
  return 0;
}

/**
 * Check if a sold date in the card text is within the last 3 months.
 * Tries multiple date formats commonly found on auction sites.
 * If no date can be extracted, returns true (include by default —
 * items on the first results page are likely recent).
 */
export function isSoldWithinThreeMonths(text: string): boolean {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  // Try "Month Day, Year" pattern (Jan 15, 2025 / January 15, 2025)
  const monthNames = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
  const monthDayYear = text.match(
    new RegExp(`(${monthNames})\\w*\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'i')
  );
  if (monthDayYear) {
    const dateStr = `${monthDayYear[1]} ${monthDayYear[2]}, ${monthDayYear[3]}`;
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date >= threeMonthsAgo;
    }
  }

  // Try "M/D/YYYY" or "MM/DD/YYYY" pattern
  const mdyMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdyMatch) {
    const date = new Date(
      parseInt(mdyMatch[3]),
      parseInt(mdyMatch[1]) - 1,
      parseInt(mdyMatch[2])
    );
    if (!isNaN(date.getTime())) {
      return date >= threeMonthsAgo;
    }
  }

  // Try relative dates: "X days/weeks/months ago"
  const relativeMatch = text.match(/(\d+)\s+(day|week|month|year)s?\s+ago/i);
  if (relativeMatch) {
    const num = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    const date = new Date();

    if (unit === 'day') date.setDate(date.getDate() - num);
    else if (unit === 'week') date.setDate(date.getDate() - num * 7);
    else if (unit === 'month') date.setMonth(date.getMonth() - num);
    else if (unit === 'year') date.setFullYear(date.getFullYear() - num);

    return date >= threeMonthsAgo;
  }

  // No date found → include by default (first page results are usually recent)
  return true;
}
