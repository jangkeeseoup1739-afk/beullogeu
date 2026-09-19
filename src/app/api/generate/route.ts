import { NextResponse } from 'next/server';
import { runSlot } from '@/lib/pipeline';
import { isCategory } from '@/lib/categories';
import { currentSlot } from '@/lib/time';
import { errorMessage } from '@/lib/logger';
import type { Slot } from '@/lib/types';

export const runtime = 'nodejs';
// 조사 + 작성 + 검증이 모두 돌기 때문에 시간이 걸립니다.
// Vercel 무료 플랜의 최대값인 300초로 둡니다.
export const maxDuration = 300;

function toSlot(value: unknown): Slot {
  return value === 'morning' || value === 'noon' || value === 'evening' ? value : currentSlot();
}

export async function POST(request: Request) {
  let body: { slot?: string; category?: string; dryRun?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  try {
    const result = await runSlot({
      slot: toSlot(body.slot),
      trigger: 'manual',
      dryRun: Boolean(body.dryRun),
      forceCategory: body.category && isCategory(body.category) ? body.category : undefined,
    });
    return NextResponse.json({
      ok: Boolean(result.post),
      message: result.message,
      post: result.post,
      log: result.log,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, message: errorMessage(error) }, { status: 500 });
  }
}
