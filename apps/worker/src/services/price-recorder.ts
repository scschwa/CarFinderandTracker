import { supabase } from '../db/client';

export async function recordPrice(listingId: string, priceInCents: number): Promise<void> {
  // Check last recorded price to avoid duplicates
  const { data: lastPrice } = await supabase
    .from('price_history')
    .select('price')
    .eq('listing_id', listingId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single();

  // Only record if price has changed or there is no previous record
  if (!lastPrice || lastPrice.price !== priceInCents) {
    const { error } = await supabase
      .from('price_history')
      .insert({ listing_id: listingId, price: priceInCents });

    if (error) {
      console.error(`[PriceRecorder] Error recording price for listing ${listingId}:`, error.message);
    } else {
      console.log(`[PriceRecorder] Recorded price ${priceInCents} for listing ${listingId}`);
    }
  }
}

export async function getPreviousPrice(listingId: string): Promise<number | null> {
  const { data } = await supabase
    .from('price_history')
    .select('price')
    .eq('listing_id', listingId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single();

  return data?.price ?? null;
}
