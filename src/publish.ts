import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from 'playwright';
import { openWithSavedSession } from './browser.js';
import {
  AUTH_DIR,
  LAST_PUBLISH_FILE,
  SCREENSHOT_DIR,
  minPublishIntervalMs,
  requireBlogId,
} from './config.js';
import {
  clickIfPresent,
  getEditorScope,
  typeIntoEditable,
  STEP_TIMEOUT_MS,
  type EditorScope,
} from './editor.js';
import { LOGIN_URL_PATTERN, SELECTORS } from './selectors.js';
import type { Post } from './types.js';

export type PublishMode = 'publish' | 'draft' | 'dry-run';

export interface PublishOptions {
  mode: PublishMode;
  headless: boolean;
}

async function enforceRateLimit(): Promise<void> {
  const interval = minPublishIntervalMs();
  if (interval <= 0 || !existsSync(LAST_PUBLISH_FILE)) return;

  try {
    const { at } = JSON.parse(readFileSync(LAST_PUBLISH_FILE, 'utf8')) as { at: number };
    const waitMs = at + interval - Date.now();
    if (waitMs > 0) {
      const seconds = Math.ceil(waitMs / 1000);
      throw new Error(
        `직전 발행으로부터 ${seconds}초 더 기다려주세요.\n` +
          '  연속 발행은 네이버의 자동화 탐지에 걸릴 수 있어 간격을 둡니다.\n' +
          '  간격은 .env 의 MIN_PUBLISH_INTERVAL_SEC 으로 조정할 수 있습니다.',
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('기다려주세요')) throw err;
    // 기록 파일이 깨졌으면 무시하고 진행합니다
  }
}

function recordPublish(): void {
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(LAST_PUBLISH_FILE, JSON.stringify({ at: Date.now() }), 'utf8');
}

async function fillPublishPanel(page: Page, scope: EditorScope, post: Post): Promise<void> {
  if (post.category) {
    if (await clickIfPresent(scope, SELECTORS.categoryOpen)) {
      const item = scope.locator(SELECTORS.categoryItem).filter({ hasText: post.category });
      try {
        await item.first().click({ timeout: 5000 });
      } catch {
        console.warn(`  ! 카테고리 "${post.category}" 를 찾지 못해 기본 카테고리로 둡니다.`);
      }
    }
  }

  if (post.tags.length > 0) {
    const tagBox = scope.locator(SELECTORS.tagInput).first();
    try {
      await tagBox.waitFor({ state: 'visible', timeout: 5000 });
      await tagBox.click();
      for (const tag of post.tags) {
        await page.keyboard.type(tag, { delay: 10 });
        await page.keyboard.press('Enter');
      }
    } catch {
      console.warn('  ! 태그 입력칸을 찾지 못해 태그 없이 진행합니다.');
    }
  }
}

export async function publishPost(post: Post, options: PublishOptions): Promise<void> {
  const blogId = requireBlogId();
  if (options.mode === 'publish') await enforceRateLimit();

  const { browser, context } = await openWithSavedSession(options.headless);
  try {
    const page = await context.newPage();
    const writeUrl = `https://blog.naver.com/${blogId}?Redirect=Write`;
    await page.goto(writeUrl, { waitUntil: 'domcontentloaded', timeout: STEP_TIMEOUT_MS });

    if (LOGIN_URL_PATTERN.test(page.url())) {
      throw new Error(
        '로그인 세션이 만료되었습니다.\n  `npm run login` 으로 다시 로그인해주세요.',
      );
    }

    const scope = await getEditorScope(page);

    // 이전에 쓰다 만 글 복구 팝업 — 취소해야 새 글로 시작합니다
    await clickIfPresent(scope, SELECTORS.restoreCancel);
    await clickIfPresent(scope, SELECTORS.helpClose);

    console.log(`  제목 입력: ${post.title}`);
    await typeIntoEditable(page, scope, SELECTORS.title, post.title);

    console.log(`  본문 입력: ${post.body.length}자`);
    await typeIntoEditable(page, scope, SELECTORS.body, post.body);

    if (options.mode === 'draft') {
      const saved = await clickIfPresent(scope, SELECTORS.draftSave, STEP_TIMEOUT_MS);
      if (!saved) throw new Error('[저장] 버튼을 찾지 못했습니다. src/selectors.ts 의 draftSave 를 확인해주세요.');
      await page.waitForTimeout(3000);
      console.log('  임시저장했습니다. 네이버 블로그 > 글쓰기 > 저장글 에서 확인하세요.');
      return;
    }

    // 발행 설정 패널 열기
    const opened = await clickIfPresent(scope, SELECTORS.publishOpen, STEP_TIMEOUT_MS);
    if (!opened) {
      throw new Error('[발행] 버튼을 찾지 못했습니다. src/selectors.ts 의 publishOpen 을 확인해주세요.');
    }
    await page.waitForTimeout(1000);
    await fillPublishPanel(page, scope, post);

    if (options.mode === 'dry-run') {
      mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const shot = resolve(SCREENSHOT_DIR, `dry-run-${Date.now()}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      console.log('');
      console.log('  [연습 모드] 발행하지 않고 멈췄습니다.');
      console.log(`  스크린샷: ${shot}`);
      console.log('  제목과 본문이 제대로 들어갔는지 눈으로 확인해주세요.');
      return;
    }

    const confirmed = await clickIfPresent(scope, SELECTORS.publishConfirm, STEP_TIMEOUT_MS);
    if (!confirmed) {
      throw new Error('발행 확인 버튼을 찾지 못했습니다. src/selectors.ts 의 publishConfirm 을 확인해주세요.');
    }

    await page.waitForLoadState('networkidle', { timeout: STEP_TIMEOUT_MS }).catch(() => {});
    recordPublish();
    console.log('');
    console.log('  발행했습니다.');
    console.log(`  확인: https://blog.naver.com/${blogId}`);
  } finally {
    await browser.close();
  }
}
