import { NextResponse } from 'next/server';
import { publishExistingPost } from '@/lib/pipeline';
import { errorMessage } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const result = await publishExistingPost(id);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: errorMessage(error) }, { status: 500 });
  }
}
