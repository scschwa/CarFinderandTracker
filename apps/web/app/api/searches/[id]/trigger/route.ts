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

  // Verify search belongs to user
  const { data: search } = await supabase
    .from('saved_searches')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (!search) {
    return NextResponse.json({ error: 'Search not found' }, { status: 404 });
  }

  // TODO: Wire up actual scraping trigger via Railway worker
  return NextResponse.json({
    message: 'Scrape triggered',
    searchId: params.id,
  });
}
