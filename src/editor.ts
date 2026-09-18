import type { FrameLocator, Page } from 'playwright';
import { EDITOR_FRAME } from './selectors.js';

/** 제목·본문이 들어가는 영역. 보통 iframe 안이지만 아닐 때도 있어 둘 다 받습니다. */
export type EditorScope = Page | FrameLocator;

export const STEP_TIMEOUT_MS = 30_000;

/**
 * 글쓰기 화면은 대개 #mainFrame iframe 안에 있지만, 진입 경로에 따라
 * 바로 열리기도 합니다. 둘 다 다룰 수 있게 스코프를 골라 돌려줍니다.
 */
export async function getEditorScope(page: Page): Promise<EditorScope> {
  const frame = page.locator(EDITOR_FRAME);
  if ((await frame.count()) > 0) {
    return page.frameLocator(EDITOR_FRAME);
  }
  return page;
}

/** 있으면 누르고, 없으면 조용히 넘어갑니다. 팝업은 뜰 때도 안 뜰 때도 있습니다. */
export async function clickIfPresent(
  scope: EditorScope,
  selector: string,
  timeoutMs = 2500,
): Promise<boolean> {
  try {
    const el = scope.locator(selector).first();
    await el.waitFor({ state: 'visible', timeout: timeoutMs });
    await el.click();
    return true;
  } catch {
    return false;
  }
}

/**
 * contenteditable 은 fill() 이 통하지 않아 클릭 후 키보드로 칩니다.
 * 줄바꿈은 Enter 로 눌러 에디터가 문단을 제대로 나누게 합니다.
 */
export async function typeIntoEditable(
  page: Page,
  scope: EditorScope,
  selector: string,
  text: string,
): Promise<void> {
  const target = scope.locator(selector).first();
  await target.waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS });
  await target.click();

  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    if (index > 0) await page.keyboard.press('Enter');
    if (line) await page.keyboard.type(line, { delay: 3 });
  }
}
