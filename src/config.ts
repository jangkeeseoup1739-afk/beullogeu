import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv();

export const PROJECT_ROOT = resolve(import.meta.dirname, '..');
export const AUTH_DIR = resolve(PROJECT_ROOT, '.auth');
export const AUTH_FILE = resolve(AUTH_DIR, 'naver.json');
export const LAST_PUBLISH_FILE = resolve(AUTH_DIR, 'last-publish.json');
export const SCREENSHOT_DIR = resolve(PROJECT_ROOT, 'screenshots');

/** BLOG_ID 는 발행할 때만 필요합니다. login 단계에서는 없어도 됩니다. */
export function requireBlogId(): string {
  const blogId = process.env.BLOG_ID?.trim();
  if (!blogId) {
    throw new Error(
      'BLOG_ID 가 설정되지 않았습니다.\n' +
        '  .env.example 을 .env 로 복사한 뒤 BLOG_ID 를 채워주세요.\n' +
        '  블로그 주소가 https://blog.naver.com/hong1234 이면 BLOG_ID=hong1234 입니다.',
    );
  }
  return blogId;
}

export function minPublishIntervalMs(): number {
  const raw = process.env.MIN_PUBLISH_INTERVAL_SEC?.trim();
  const seconds = raw ? Number(raw) : 60;
  if (!Number.isFinite(seconds) || seconds < 0) return 60_000;
  return seconds * 1000;
}
