import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import Papa from 'papaparse';

export async function GET(
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
    .select('id, make, model')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (!search) {
    return NextResponse.json({ error: 'Search not found' }, { status: 404 });
  }

  const { data: listings, error } = await supabase
    .from('listings')
    .select('*, vehicles(*)')
    .eq('search_id', params.id)
    .order('last_seen', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const csvData = (listings || []).map(l => ({
    VIN: l.vehicles?.vin || '',
    Year: l.vehicles?.year || '',
    Make: l.vehicles?.make || '',
    Model: l.vehicles?.model || '',
    Trim: l.vehicles?.trim || '',
    Price: l.current_price ? (l.current_price / 100).toFixed(2) : '',
    'Sale Price': l.sale_price ? (l.sale_price / 100).toFixed(2) : '',
    Status: l.status,
    Source: l.source_site,
    Location: l.geography || '',
    URL: l.url,
    'First Seen': l.first_seen,
    'Last Seen': l.last_seen,
  }));

  const csv = Papa.unparse(csvData);
  const filename = `${search.make}_${search.model}_listings.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
