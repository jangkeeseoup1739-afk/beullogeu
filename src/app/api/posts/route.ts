import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { errorMessage } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') ?? '60');
  try {
    const posts = await getStore().listPosts(Number.isFinite(limit) ? limit : 60);
    return NextResponse.json({ ok: true, posts });
  } catch (error) {
    return NextResponse.json({ ok: false, message: errorMessage(error) }, { status: 500 });
  }
}
