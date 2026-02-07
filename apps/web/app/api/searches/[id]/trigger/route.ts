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

  const workerUrl = process.env.WORKER_URL;
  if (!workerUrl) {
    return NextResponse.json({ error: 'Worker not configured' }, { status: 503 });
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.WORKER_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.WORKER_API_KEY}`;
    }

    const workerRes = await fetch(`${workerUrl}/trigger/${params.id}`, {
      method: 'POST',
      headers,
    });

    if (!workerRes.ok) {
      const body = await workerRes.text();
      return NextResponse.json(
        { error: 'Worker returned an error', detail: body },
        { status: workerRes.status }
      );
    }

    const result = await workerRes.json();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to reach worker', detail: message }, { status: 502 });
  }
}
