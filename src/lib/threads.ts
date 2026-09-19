/**
 * [11] Threads 공식 API 게시 모듈.
 *
 * 게시는 두 단계입니다.
 *   1) POST /{threads-user-id}/threads          → 미디어 컨테이너 생성 (creation_id 반환)
 *   2) POST /{threads-user-id}/threads_publish  → 실제 게시 (post id 반환)
 * 그다음 GET /{post-id}?fields=permalink 로 게시 결과를 확인합니다.
 *
 * 제한 사항
 *   - 텍스트 500자
 *   - 24시간당 250건 게시
 *   - 장기 액세스 토큰 60일 (발급 24시간 후부터 갱신 가능)
 *
 * 토큰은 환경 변수에서만 읽습니다. 저장소에 쓰거나 로그에 남기지 않습니다.
 */
import { loadConfig } from './config';
import { THREADS_MAX_CHARS } from './writer';

const API_BASE = 'https://graph.threads.net/v1.0';
const TOKEN_BASE = 'https://graph.threads.net';

export class ThreadsError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, status: number, code: string, retryable: boolean) {
    super(message);
    this.name = 'ThreadsError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

interface ThreadsApiError {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

/** 토큰이 로그에 남지 않도록 메시지에서 지웁니다. */
function scrub(message: string, token: string): string {
  if (!token) return message;
  return message.split(token).join('[TOKEN]');
}

async function request<T>(
  path: string,
  init: { method: 'GET' | 'POST'; params: Record<string, string>; token: string },
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  const body = new URLSearchParams();

  if (init.method === 'GET') {
    for (const [key, value] of Object.entries(init.params)) url.searchParams.set(key, value);
    url.searchParams.set('access_token', init.token);
  } else {
    for (const [key, value] of Object.entries(init.params)) body.set(key, value);
    body.set('access_token', init.token);
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: init.method,
      headers:
        init.method === 'POST'
          ? { 'Content-Type': 'application/x-www-form-urlencoded' }
          : undefined,
      body: init.method === 'POST' ? body.toString() : undefined,
      cache: 'no-store',
    });
  } catch (error) {
    // 네트워크 오류는 재시도 대상입니다.
    const message = error instanceof Error ? error.message : String(error);
    throw new ThreadsError(`네트워크 오류: ${message}`, 0, 'network_error', true);
  }

  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const apiError = (parsed as ThreadsApiError | null)?.error;
    const message = scrub(apiError?.message ?? raw ?? '알 수 없는 오류', init.token);
    const code = apiError?.type ?? String(response.status);
    // 5xx 와 429 는 잠시 후 다시 시도할 수 있습니다. 4xx 는 요청 자체를 고쳐야 합니다.
    const retryable = response.status >= 500 || response.status === 429;
    throw new ThreadsError(message, response.status, code, retryable);
  }

  return parsed as T;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** 재시도 래퍼. 재시도 가능한 오류일 때만 2초, 4초, 8초 간격으로 다시 시도합니다. */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable = error instanceof ThreadsError ? error.retryable : false;
      if (!retryable || attempt === attempts - 1) break;
      const waitMs = 2000 * 2 ** attempt;
      console.warn(`${label} 실패, ${waitMs / 1000}초 후 재시도합니다.`);
      await sleep(waitMs);
    }
  }
  throw lastError;
}

export interface PublishResult {
  creationId: string;
  postId: string;
  permalink?: string;
  publishedAt: string;
}

/**
 * 텍스트 게시물을 올립니다.
 * 컨테이너 생성 후 게시까지 잠깐 기다립니다(Meta 권장).
 */
export async function publishText(text: string): Promise<PublishResult> {
  const { config, canPublish } = loadConfig();
  if (!canPublish) {
    throw new ThreadsError(
      'THREADS_ACCESS_TOKEN 또는 THREADS_USER_ID 가 설정되지 않았습니다.',
      0,
      'missing_credentials',
      false,
    );
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new ThreadsError('본문이 비어 있습니다.', 0, 'empty_text', false);
  }
  if (trimmed.length > THREADS_MAX_CHARS) {
    throw new ThreadsError(
      `본문이 ${trimmed.length}자입니다. Threads 제한은 ${THREADS_MAX_CHARS}자입니다.`,
      0,
      'text_too_long',
      false,
    );
  }

  const token = config.threadsAccessToken;
  const userId = config.threadsUserId;

  // 1) 컨테이너 생성
  const container = await withRetry('컨테이너 생성', () =>
    request<{ id: string }>(`/${userId}/threads`, {
      method: 'POST',
      params: { media_type: 'TEXT', text: trimmed },
      token,
    }),
  );
  if (!container?.id) {
    throw new ThreadsError('컨테이너 생성 응답에 id가 없습니다.', 0, 'no_creation_id', false);
  }

  // 2) 게시 (컨테이너 처리 시간을 위해 잠시 대기)
  await sleep(3000);
  const published = await withRetry('게시', () =>
    request<{ id: string }>(`/${userId}/threads_publish`, {
      method: 'POST',
      params: { creation_id: container.id },
      token,
    }),
  );
  if (!published?.id) {
    throw new ThreadsError('게시 응답에 id가 없습니다.', 0, 'no_post_id', false);
  }

  // 3) 결과 확인 (실패해도 게시 자체는 성공이므로 무시합니다)
  let permalink: string | undefined;
  try {
    const detail = await request<{ permalink?: string }>(`/${published.id}`, {
      method: 'GET',
      params: { fields: 'id,permalink,timestamp' },
      token,
    });
    permalink = detail?.permalink;
  } catch {
    permalink = undefined;
  }

  return {
    creationId: container.id,
    postId: published.id,
    permalink,
    publishedAt: new Date().toISOString(),
  };
}

export interface PublishingLimit {
  used: number;
  quota: number;
}

/** 24시간 게시 한도 사용량 확인 */
export async function getPublishingLimit(): Promise<PublishingLimit | null> {
  const { config, canPublish } = loadConfig();
  if (!canPublish) return null;
  try {
    const response = await request<{
      data?: { quota_usage?: number; config?: { quota_total?: number } }[];
    }>(`/${config.threadsUserId}/threads_publishing_limit`, {
      method: 'GET',
      params: { fields: 'quota_usage,config' },
      token: config.threadsAccessToken,
    });
    const entry = response?.data?.[0];
    if (!entry) return null;
    return { used: entry.quota_usage ?? 0, quota: entry.config?.quota_total ?? 250 };
  } catch {
    return null;
  }
}

/** 연결 확인용. 계정 id와 username을 돌려줍니다. */
export async function getMe(): Promise<{ id: string; username?: string } | null> {
  const { config, canPublish } = loadConfig();
  if (!canPublish) return null;
  try {
    return await request<{ id: string; username?: string }>('/me', {
      method: 'GET',
      params: { fields: 'id,username' },
      token: config.threadsAccessToken,
    });
  } catch {
    return null;
  }
}

/**
 * 장기 토큰 갱신.
 * 새 토큰을 돌려주기만 합니다. 환경 변수를 코드가 바꿀 수는 없으므로,
 * 돌려받은 값을 Vercel과 GitHub Secrets에 직접 붙여넣어야 합니다.
 */
export async function refreshLongLivedToken(): Promise<{
  accessToken: string;
  expiresInDays: number;
} | null> {
  const { config } = loadConfig();
  if (!config.threadsAccessToken) return null;
  const url = new URL(`${TOKEN_BASE}/refresh_access_token`);
  url.searchParams.set('grant_type', 'th_refresh_token');
  url.searchParams.set('access_token', config.threadsAccessToken);

  const response = await fetch(url.toString(), { cache: 'no-store' });
  const raw = await response.text();
  if (!response.ok) {
    throw new ThreadsError(
      scrub(raw, config.threadsAccessToken),
      response.status,
      'refresh_failed',
      response.status >= 500,
    );
  }
  const parsed = JSON.parse(raw) as { access_token?: string; expires_in?: number };
  if (!parsed.access_token) return null;
  return {
    accessToken: parsed.access_token,
    expiresInDays: Math.round((parsed.expires_in ?? 0) / 86400),
  };
}
