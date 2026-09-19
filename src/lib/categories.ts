import type { Category, Slot } from './types';

/** [19] 카테고리 전체 목록 */
export const ALL_CATEGORIES: Category[] = [
  'NEWS',
  '청약',
  '분양',
  '정책',
  '아파트',
  '오피스텔',
  '상가',
  '지식산업센터',
  '재개발',
  '재건축',
  '전세',
  '월세',
  '대출',
  '세금',
  '시장분석',
  '지역정보',
  '부동산상식',
  '제이원플렉스',
];

/**
 * [2] 콘텐츠 비율.
 * 요청하신 8개 묶음을 그대로 목표치로 쓰고, 세부 카테고리를 각 묶음에 넣었습니다.
 * 합계는 1.0 입니다.
 */
export const RATIO_GROUPS: { name: string; target: number; categories: Category[] }[] = [
  { name: '부동산뉴스', target: 0.25, categories: ['NEWS'] },
  { name: '청약분양', target: 0.20, categories: ['청약', '분양'] },
  { name: '부동산정책', target: 0.15, categories: ['정책', '재개발', '재건축'] },
  { name: '시장가격거래', target: 0.10, categories: ['시장분석', '전세', '월세', '지역정보'] },
  { name: '대출금융세금', target: 0.10, categories: ['대출', '세금'] },
  { name: '아파트오피스텔', target: 0.10, categories: ['아파트', '오피스텔'] },
  { name: '수익형부동산', target: 0.05, categories: ['상가', '지식산업센터'] },
  { name: '제이원플렉스', target: 0.05, categories: ['제이원플렉스'] },
];

/**
 * 부동산상식은 비율 묶음에 넣지 않습니다.
 * 뉴스 검색이 실패했거나 쓸 만한 최신 자료가 없을 때 쓰는 대체 카테고리입니다.
 * ([15] 검색 실패에도 자동화가 멈추지 않도록)
 */
export const FALLBACK_CATEGORY: Category = '부동산상식';

/** [9] 슬롯별 후보 카테고리 */
export const SLOT_CANDIDATES: Record<Slot, Category[]> = {
  // 09:00 오늘의 부동산 뉴스 / 정책
  morning: ['NEWS', '정책', '재개발', '재건축'],
  // 13:00 청약 / 분양 / 시장 정보
  noon: ['청약', '분양', '시장분석', '전세', '월세', '아파트', '지역정보'],
  // 19:00 부동산 상식 / 지역정보 / 제이원플렉스 / 수익형 부동산
  evening: ['부동산상식', '지역정보', '제이원플렉스', '상가', '지식산업센터', '오피스텔', '대출', '세금'],
};

/**
 * 이번 실행에서 쓸 후보 카테고리.
 *
 * 하루 3회로 돌리면 슬롯별 역할대로([9]) 후보가 나뉩니다.
 * 하루 1회로 줄이면 아침 후보(뉴스·정책)만 계속 나오게 되므로,
 * 이때는 모든 카테고리를 후보로 놓고 목표 비율([2])에 따라 돌아가게 합니다.
 */
export function candidatesFor(slot: Slot, postsPerDay: number): Category[] {
  if (postsPerDay <= 1) {
    const merged = new Set<Category>();
    for (const list of Object.values(SLOT_CANDIDATES)) {
      for (const category of list) merged.add(category);
    }
    return [...merged];
  }
  return SLOT_CANDIDATES[slot];
}

export const SLOT_LABEL: Record<Slot, string> = {
  morning: '09:00 뉴스·정책',
  noon: '13:00 청약·분양·시장',
  evening: '19:00 상식·지역·수익형',
};

export const SLOT_HOUR_KST: Record<Slot, number> = {
  morning: 9,
  noon: 13,
  evening: 19,
};

/**
 * 숫자·일정·세율이 틀리면 안 되는 카테고리 → 자동 게시하지 않고 관리자 승인을 받습니다.
 * 제이원플렉스는 자사 홍보성 글이라 함께 승인 대상으로 두었습니다.
 * 이 목록만 고치면 승인 정책이 바뀝니다.
 */
export const SENSITIVE_CATEGORIES: Category[] = ['청약', '분양', '세금', '대출', '제이원플렉스'];

export function isSensitive(category: Category): boolean {
  return SENSITIVE_CATEGORIES.includes(category);
}

export function groupOf(category: Category): string {
  const group = RATIO_GROUPS.find((g) => g.categories.includes(category));
  return group ? group.name : '기타';
}

export function isCategory(value: string): value is Category {
  return (ALL_CATEGORIES as string[]).includes(value);
}

/** 카테고리별 조사·작성 시 반드시 확인해야 하는 항목 ([5] 청약 콘텐츠 등) */
export const CATEGORY_CHECKLIST: Partial<Record<Category, string>> = {
  청약:
    '입주자모집공고에서 확인된 항목만 쓴다: 단지명, 지역, 청약 일정(특별공급/일반공급), 주택형, 분양가, 공급 세대수, 청약 자격, 전매제한, 거주의무, 당첨자 발표일, 입주 예정일. 공고에서 확인되지 않은 항목은 추측하지 말고 아예 쓰지 않는다.',
  분양:
    '분양 공고와 공식 자료에서 확인된 물량, 위치, 일정만 쓴다. 분양가는 공고에 명시된 값만 쓴다.',
  세금:
    '반드시 최신 법령과 정부 자료(기획재정부, 국세청, 국토교통부)를 근거로 한다. 세율, 공제, 적용 시점을 정확히 구분하고, 개정 예정과 시행 중인 제도를 섞지 않는다.',
  대출:
    'LTV, DTI, DSR, 금리, 정책대출 조건은 금융위원회·금융감독원·주택금융공사 등 공식 자료 기준으로 쓴다. 적용 대상과 시행일을 명확히 구분한다.',
  정책:
    '정부 발표 원문을 기준으로 사실만 전달한다. 정책 평가나 정치적 표현은 쓰지 않는다. 시행일과 적용 범위를 명확히 한다.',
  시장분석:
    '가격, 거래량, 미분양, 입주물량은 한국부동산원·통계청·국토교통부 통계 기준으로 쓰고 기준 시점(몇 월 기준)을 함께 밝힌다.',
};
