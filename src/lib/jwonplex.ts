/**
 * [8] 제이원플렉스 관련 정보.
 *
 * 규칙: 이 파일에 적힌 "확정 사실"만 글에 쓸 수 있습니다.
 * 거리, 분양가, 대출, 세금, 계약조건, 잔여호실처럼 최신 제공자료가 없으면
 * 임의로 만들지 않습니다. 아래 UNVERIFIED_FIELDS 는 값이 비어 있으며,
 * 비어 있는 항목은 글에 쓰지 않습니다.
 */

export const PROJECT_NAME = '주안국가산단역 제이원플렉스 지식산업센터';

/** 확정 사실 — 그대로 문장에 써도 되는 내용 */
export const CONFIRMED_FACTS: string[] = [
  '인천 미추홀구 주안동에 위치한 지식산업센터',
  '인천2호선 주안국가산단역 인근',
  '주안역 접근성',
  '가좌IC 및 도화IC 접근성',
  '드라이브인 시스템 적용',
  '도어투도어 구조',
  '지하 2층~지상 4층 구간의 물류 동선',
  '지하 1층~지상 10층 규모',
];

/**
 * 최신 제공자료가 없으면 절대 쓰지 않는 항목.
 * 나중에 정확한 자료를 받으면 값을 채우세요. 값이 있을 때만 글에 사용됩니다.
 */
export const UNVERIFIED_FIELDS: Record<string, string> = {
  역까지_정확한_거리: '',
  분양가: '',
  대출조건: '',
  세금: '',
  계약조건: '',
  잔여호실: '',
  준공예정일: '',
  전용면적: '',
  주차대수: '',
};

/** 제이원플렉스 글을 정보형으로 풀어내기 위한 주제 후보 */
export const INFO_ANGLES: string[] = [
  '지식산업센터를 알아볼 때 확인해야 하는 사항',
  '사업장을 이전할 때 차량 동선이 중요한 이유',
  '인천 산업단지 주변 입지를 볼 때 확인할 것',
  '드라이브인 구조가 실제 업무에 주는 차이',
  '도어투도어 구조가 필요한 업종은 어디인가',
  '지식산업센터 입주 전에 확인해야 할 층별 하중과 물류 동선',
  '역세권 지식산업센터에서 직원 출퇴근 동선을 확인하는 방법',
];

/** 제이원플렉스 글 사이 최소 간격 (일). 전체의 5%를 넘지 않게 하는 안전장치입니다. */
export const MIN_DAYS_BETWEEN_POSTS = 7;

export function availableFacts(): string[] {
  const extra = Object.entries(UNVERIFIED_FIELDS)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`);
  return [...CONFIRMED_FACTS, ...extra];
}

export function forbiddenTopics(): string[] {
  return Object.entries(UNVERIFIED_FIELDS)
    .filter(([, value]) => value.trim().length === 0)
    .map(([key]) => key.replace(/_/g, ' '));
}
