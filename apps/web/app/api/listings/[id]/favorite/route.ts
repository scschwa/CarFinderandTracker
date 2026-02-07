import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from('user_vehicle_prefs')
    .select('id, is_favorited')
    .eq('user_id', user.id)
    .eq('listing_id', params.id)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('user_vehicle_prefs')
      .update({ is_favorited: !existing.is_favorited })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from('user_vehicle_prefs')
    .insert({ user_id: user.id, listing_id: params.id, is_favorited: true })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
