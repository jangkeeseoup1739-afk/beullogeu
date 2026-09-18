import { chromium, type Browser, type BrowserContext } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { AUTH_DIR, AUTH_FILE } from './config.js';
import { AUTH_COOKIE_NAMES } from './selectors.js';

export interface Session {
  browser: Browser;
  context: BrowserContext;
}

/**
 * 저장된 로그인 세션으로 브라우저를 엽니다.
 * headless 는 기본 false 입니다 — 무슨 일이 일어나는지 직접 보는 편이
 * 셀렉터가 깨졌을 때 훨씬 빨리 알아챌 수 있습니다.
 */
export async function openWithSavedSession(headless = false): Promise<Session> {
  if (!existsSync(AUTH_FILE)) {
    throw new Error(
      '저장된 로그인 세션이 없습니다.\n' +
        '  먼저 `npm run login` 을 실행해 네이버에 한 번 로그인해주세요.',
    );
  }
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    storageState: AUTH_FILE,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1440, height: 960 },
  });
  return { browser, context };
}

/** 로그인용 빈 브라우저. 세션 없이 엽니다. */
export async function openForLogin(): Promise<Session> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1440, height: 960 },
  });
  return { browser, context };
}

/** 인증 쿠키가 모두 들어왔는지 확인합니다. 로그인 완료 판정에 씁니다. */
export async function hasAuthCookies(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies('https://naver.com');
  const names = new Set(cookies.map((c) => c.name));
  return AUTH_COOKIE_NAMES.every((n) => names.has(n));
}

export async function saveSession(context: BrowserContext): Promise<void> {
  mkdirSync(AUTH_DIR, { recursive: true });
  await context.storageState({ path: AUTH_FILE });
}
