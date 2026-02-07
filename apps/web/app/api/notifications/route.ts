import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('notification_settings')
    .select('*, saved_searches(make, model, year_min, year_max)')
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

const upsertSchema = z.object({
  search_id: z.string().uuid(),
  price_drop_enabled: z.boolean().optional(),
  price_drop_pct: z.number().int().min(1).max(50).optional(),
  new_listing_enabled: z.boolean().optional(),
  sold_alert_enabled: z.boolean().optional(),
  email: z.string().email().nullable().optional(),
});

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = upsertSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { search_id, ...settings } = parsed.data;

  const { data, error } = await supabase
    .from('notification_settings')
    .upsert(
      { user_id: user.id, search_id, ...settings },
      { onConflict: 'user_id,search_id' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
