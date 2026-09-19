import { NextResponse } from 'next/server';
import { isValidCronRequest } from '@/lib/auth';
import { runSlot } from '@/lib/pipeline';
import { currentSlot } from '@/lib/time';
import { errorMessage } from '@/lib/logger';
import type { Slot } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * 외부 실행기(GitHub Actions, cron-job.org, Vercel Cron)가 호출하는 자동 실행 엔드포인트입니다.
 * 반드시 CRON_SECRET 을 함께 보내야 합니다.
 *
 *   curl -X POST "https://내주소/api/cron/run?slot=morning" -H "x-cron-secret: <CRON_SECRET>"
 *
 * 참고: 기본 구성에서는 GitHub Actions가 파이프라인을 직접 실행하므로 이 엔드포인트는
 * 대체 수단입니다. (Vercel 함수는 최대 300초라 조사가 길어지면 끊길 수 있습니다)
 */
async function handle(request: Request) {
  if (!isValidCronRequest(request.headers)) {
    return NextResponse.json({ ok: false, message: '인증 실패' }, { status: 401 });
  }

  const url = new URL(request.url);
  const slotParam = url.searchParams.get('slot');
  const slot: Slot =
    slotParam === 'morning' || slotParam === 'noon' || slotParam === 'evening'
      ? slotParam
      : currentSlot();

  try {
    const result = await runSlot({ slot, trigger: 'cron' });
    return NextResponse.json({
      ok: true,
      message: result.message,
      status: result.post?.status ?? 'none',
      postId: result.post?.id ?? null,
    });
  } catch (error) {
    // 오류가 나도 500 대신 200 으로 내려 외부 크론이 계속 동작하게 합니다.
    return NextResponse.json({ ok: false, message: errorMessage(error) });
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
