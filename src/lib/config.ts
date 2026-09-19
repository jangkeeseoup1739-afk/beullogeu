/**
 * 환경 변수 로딩과 검증.
 *
 * 중요: 환경 변수가 없을 때 예외를 던지지 않습니다. ([15] 오류 처리)
 * 값이 없으면 "무엇이 없는지"를 담은 결과를 돌려주고, 호출한 쪽에서 판단하게 합니다.
 * 이렇게 해야 환경 변수 하나가 빠졌을 때 자동화 전체가 멈추지 않습니다.
 */

export interface AppConfig {
  anthropicApiKey: string;
  threadsAccessToken: string;
  threadsUserId: string;
  adminPassword: string;
  cronSecret: string;
  blobToken: string;
  appBaseUrl: string;
  threadsTokenIssuedAt: string;
  autoPublish: boolean;
  /** 하루 게시 횟수. 1이면 모든 카테고리를 한 슬롯에서 돌아가며 씁니다. */
  postsPerDay: number;
}

export interface ConfigCheck {
  config: AppConfig;
  /** 비어 있는 필수 환경 변수 이름 */
  missing: string[];
  /** 콘텐츠 생성이 가능한가 (Anthropic 키만 있으면 가능) */
  canGenerate: boolean;
  /** Threads 게시가 가능한가 */
  canPublish: boolean;
  /** 저장소가 Vercel Blob인가, 로컬 파일인가 */
  storage: 'blob' | 'local';
}

function env(name: string): string {
  return (process.env[name] ?? '').trim();
}

/** 1~3 사이의 값만 허용하고, 잘못된 값이면 기본값 1을 씁니다. */
function parsePostsPerDay(raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 1;
  if (value < 1) return 1;
  if (value > 3) return 3;
  return Math.round(value);
}

export function loadConfig(): ConfigCheck {
  const config: AppConfig = {
    anthropicApiKey: env('ANTHROPIC_API_KEY'),
    threadsAccessToken: env('THREADS_ACCESS_TOKEN'),
    threadsUserId: env('THREADS_USER_ID'),
    adminPassword: env('ADMIN_PASSWORD'),
    cronSecret: env('CRON_SECRET'),
    blobToken: env('BLOB_READ_WRITE_TOKEN'),
    appBaseUrl: env('APP_BASE_URL'),
    threadsTokenIssuedAt: env('THREADS_TOKEN_ISSUED_AT'),
    // 기본값은 true. 'false' 라고 적었을 때만 자동 게시를 끕니다.
    autoPublish: env('AUTO_PUBLISH').toLowerCase() !== 'false',
    postsPerDay: parsePostsPerDay(env('POSTS_PER_DAY')),
  };

  const missing: string[] = [];
  if (!config.anthropicApiKey) missing.push('ANTHROPIC_API_KEY');
  if (!config.threadsAccessToken) missing.push('THREADS_ACCESS_TOKEN');
  if (!config.threadsUserId) missing.push('THREADS_USER_ID');
  if (!config.adminPassword) missing.push('ADMIN_PASSWORD');

  return {
    config,
    missing,
    canGenerate: Boolean(config.anthropicApiKey),
    canPublish: Boolean(config.threadsAccessToken && config.threadsUserId),
    storage: config.blobToken ? 'blob' : 'local',
  };
}

/** Threads 토큰 만료까지 남은 일수. 발급일을 모르면 null. (장기 토큰은 60일) */
export function tokenDaysLeft(issuedAt: string): number | null {
  if (!issuedAt) return null;
  const issued = new Date(`${issuedAt}T00:00:00Z`).getTime();
  if (Number.isNaN(issued)) return null;
  const expires = issued + 60 * 24 * 60 * 60 * 1000;
  return Math.floor((expires - Date.now()) / (24 * 60 * 60 * 1000));
}

/** 모델 설정을 한곳에서 관리합니다. 비용을 조절할 때 이 파일만 고치면 됩니다. */
export const MODEL = {
  /** 조사 단계 — 최신 자료를 찾고 중요도를 판단 */
  research: 'claude-opus-5',
  /** 작성 단계 — Threads 글 작성 */
  writer: 'claude-opus-5',
  /** 검증 단계 — 사실 대조. 판정만 하므로 effort를 낮게 씁니다 */
  verifier: 'claude-opus-5',
} as const;

/** 1M 토큰당 단가 (USD). 비용 추정에만 사용합니다. */
export const PRICING = {
  input: 5,
  output: 25,
  cacheRead: 0.5,
  cacheWrite: 6.25,
  /** 웹 검색 1,000회당 $10 */
  webSearchPerCall: 0.01,
} as const;
