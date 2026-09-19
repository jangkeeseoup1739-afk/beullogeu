/**
 * 시스템 전체에서 쓰는 타입 정의.
 * 게시 기록(PostRecord)이 이 프로젝트의 중심 데이터입니다.
 */

/** 하루 3회 게시 슬롯 ([9] 하루 게시량) */
export type Slot = 'morning' | 'noon' | 'evening';

/** [19] 콘텐츠 카테고리 자동 분류 */
export type Category =
  | 'NEWS'
  | '청약'
  | '분양'
  | '정책'
  | '아파트'
  | '오피스텔'
  | '상가'
  | '지식산업센터'
  | '재개발'
  | '재건축'
  | '전세'
  | '월세'
  | '대출'
  | '세금'
  | '시장분석'
  | '지역정보'
  | '부동산상식'
  | '제이원플렉스';

/**
 * 게시물 상태
 * - pending_approval: 민감 카테고리라 관리자 승인 대기
 * - published: Threads 게시 완료
 * - failed: 게시 시도했으나 실패 (재시도 대상)
 * - held: 검증을 통과하지 못해 보류 (게시하지 않음)
 * - cancelled: 관리자가 게시를 취소
 */
export type PostStatus = 'pending_approval' | 'published' | 'failed' | 'held' | 'cancelled';

/** [14] 데이터 및 출처 표시 — 내부적으로 항상 원문 출처를 저장한다 */
export interface SourceRef {
  title: string;
  url: string;
  publisher: string;
  publishedAt?: string;
}

/** 검증 결과 ([7] 정치적 중립 및 사실관계) */
export interface VerificationResult {
  passed: boolean;
  /** 결정론적 검사에서 걸린 문제 (길이, 금지 표현 등) */
  ruleIssues: string[];
  /** Claude 대조 검증에서 근거를 찾지 못한 문장 */
  unsupportedSentences: string[];
  /** 정치적 중립성 위반으로 판단된 표현 */
  politicalIssues: string[];
  /** 0~1. 조사 자료와의 일치 정도 */
  confidence: number;
  notes: string;
}

/** 중복 검사 결과 ([10] 게시물 중복 방지) */
export interface DedupeResult {
  isDuplicate: boolean;
  /** 비교한 과거 게시물 수 */
  comparedCount: number;
  maxSimilarity: number;
  reason?: string;
  similarPostId?: string;
  /** 재작성 시도 횟수 */
  attempts: number;
}

/** 토큰 사용량과 추정 비용 (비용 실측용) */
export interface UsageRecord {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  webSearchCount: number;
  estimatedUsd: number;
}

export interface PostRecord {
  id: string;
  /** ISO 문자열 (UTC) */
  createdAt: string;
  /** 한국 날짜 YYYY-MM-DD */
  dateKey: string;
  slot: Slot;
  category: Category;
  /** Threads 본문 (500자 이내) */
  text: string;
  /** 첫 문장 (관심을 끄는 한 줄) */
  hook: string;
  /** 중복 판정용 주제 키: 카테고리 + 지역 + 핵심 숫자 */
  topicKey: string;
  keywords: string[];
  sources: SourceRef[];
  status: PostStatus;
  needsApproval: boolean;
  verification: VerificationResult;
  dedupe: DedupeResult;
  threads?: {
    creationId?: string;
    postId?: string;
    permalink?: string;
    publishedAt?: string;
  };
  error?: { stage: string; message: string; at: string };
  usage: UsageRecord;
  model: string;
}

/** 조사 결과 캐시 ([3] 최신 뉴스 자동 검색) */
export interface ResearchItem {
  headline: string;
  summary: string;
  /** 부동산 시장에서의 의미 */
  meaning: string;
  category: Category;
  region?: string;
  /** 1(참고) ~ 5(당일 최우선) */
  importance: number;
  sources: SourceRef[];
  /** 본문에 쓸 수 있는 확인된 숫자·일정 */
  verifiedFacts: string[];
}

export interface ResearchResult {
  dateKey: string;
  createdAt: string;
  items: ResearchItem[];
  /** 검색이 실패했거나 결과가 비었는지 */
  ok: boolean;
  notes: string;
  usage: UsageRecord;
}

/** 실행 로그 ([15] 오류 처리) */
export interface RunLog {
  id: string;
  dateKey: string;
  slot: Slot;
  startedAt: string;
  finishedAt: string;
  /** 어느 단계까지 갔는지 */
  stages: { name: string; ok: boolean; ms: number; message?: string }[];
  result: 'published' | 'pending_approval' | 'held' | 'skipped' | 'failed';
  postId?: string;
  error?: string;
  usage: UsageRecord;
  /** 수동 실행인지 자동 실행인지 */
  trigger: 'cron' | 'manual';
}

export interface Settings {
  /** [13] 자동화 ON/OFF */
  automationEnabled: boolean;
  /** 마지막 실행 시간 (ISO) */
  lastRunAt?: string;
  lastRunResult?: string;
  updatedAt: string;
}
