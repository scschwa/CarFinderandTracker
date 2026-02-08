import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateSearchSchema = z.object({
  make: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  trim: z.string().nullable().optional(),
  year_min: z.number().int().min(1900).max(2030).optional(),
  year_max: z.number().int().min(1900).max(2030).optional(),
  enabled_sites: z.array(z.string()).min(1).optional(),
  is_active: z.boolean().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: search, error: searchError } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (searchError || !search) {
    return NextResponse.json({ error: 'Search not found' }, { status: 404 });
  }

  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('*, vehicles(*)')
    .eq('search_id', params.id)
    .order('last_seen', { ascending: false });

  if (listingsError) {
    return NextResponse.json({ error: listingsError.message }, { status: 500 });
  }

  // Get user prefs for these listings
  const listingIds = (listings || []).map(l => l.id);
  let prefs: Record<string, { is_hidden: boolean; is_favorited: boolean }> = {};

  if (listingIds.length > 0) {
    const { data: prefsData } = await supabase
      .from('user_vehicle_prefs')
      .select('*')
      .eq('user_id', user.id)
      .in('listing_id', listingIds);

    if (prefsData) {
      prefs = Object.fromEntries(
        prefsData.map(p => [p.listing_id, { is_hidden: p.is_hidden, is_favorited: p.is_favorited }])
      );
    }
  }

  const listingsWithPrefs = (listings || []).map(l => ({
    ...l,
    user_prefs: prefs[l.id] || { is_hidden: false, is_favorited: false },
  }));

  return NextResponse.json({ search, listings: listingsWithPrefs });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSearchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('saved_searches')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabase
    .from('saved_searches')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
