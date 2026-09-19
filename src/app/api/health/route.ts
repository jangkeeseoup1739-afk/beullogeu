import { NextResponse } from 'next/server';
import { loadConfig, tokenDaysLeft } from '@/lib/config';
import { getStore } from '@/lib/store';
import { getMe, getPublishingLimit } from '@/lib/threads';
import { errorMessage } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 환경 변수, 저장소, Threads 연결 상태를 한 번에 점검합니다. */
export async function GET() {
  const check = loadConfig();
  const store = getStore();

  let storageOk = false;
  let storageError: string | undefined;
  try {
    await store.getSettings();
    storageOk = true;
  } catch (error) {
    storageError = errorMessage(error);
  }

  const me = check.canPublish ? await getMe() : null;
  const limit = check.canPublish ? await getPublishingLimit() : null;

  return NextResponse.json({
    ok: check.missing.length === 0 && storageOk,
    env: {
      missing: check.missing,
      canGenerate: check.canGenerate,
      canPublish: check.canPublish,
      autoPublish: check.config.autoPublish,
    },
    storage: { kind: store.kind, ok: storageOk, error: storageError },
    threads: {
      connected: Boolean(me),
      username: me?.username ?? null,
      publishingLimit: limit,
      tokenDaysLeft: tokenDaysLeft(check.config.threadsTokenIssuedAt),
    },
  });
}
