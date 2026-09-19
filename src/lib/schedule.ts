/**
 * [2][9] 카테고리 자동 조정.
 *
 * 매일 같은 카테고리가 반복되지 않도록, 최근 기록을 보고 목표 비율보다 부족한 묶음을 먼저 고릅니다.
 * 중요한 뉴스(중요도 4 이상)가 있으면 그 카테고리의 우선순위를 올립니다.
 */
import { FALLBACK_CATEGORY, RATIO_GROUPS, groupOf } from './categories';
import { MIN_DAYS_BETWEEN_POSTS } from './jwonplex';
import { dateKeyKst, daysBetween } from './time';
import type { Category, PostRecord, ResearchResult } from './types';

/** 비율 계산에 쓰는 최근 게시물 수 */
export const RATIO_WINDOW = 40;

export interface CategoryChoice {
  category: Category;
  reason: string;
  /** 후보별 점수 (관리자 화면과 로그에서 판단 근거를 볼 수 있게) */
  scores: { category: Category; score: number; note: string }[];
}

function publishedOrPending(posts: PostRecord[]): PostRecord[] {
  return posts.filter((post) => post.status === 'published' || post.status === 'pending_approval');
}

/** 최근 기록에서 각 비율 묶음이 실제로 차지한 비중 */
export function groupShares(posts: PostRecord[]): Map<string, number> {
  const window = publishedOrPending(posts).slice(0, RATIO_WINDOW);
  const counts = new Map<string, number>();
  for (const post of window) {
    const group = groupOf(post.category);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  const shares = new Map<string, number>();
  const total = window.length;
  for (const group of RATIO_GROUPS) {
    shares.set(group.name, total === 0 ? 0 : (counts.get(group.name) ?? 0) / total);
  }
  return shares;
}

function daysSinceCategory(posts: PostRecord[], category: Category, today: string): number {
  const found = publishedOrPending(posts).find((post) => post.category === category);
  if (!found) return Number.POSITIVE_INFINITY;
  return daysBetween(today, found.dateKey);
}

/**
 * 이번 슬롯에 쓸 카테고리를 고릅니다.
 * 조사 결과가 없으면 부동산상식으로 대체합니다. ([15])
 */
export function selectCategory(
  candidates: Category[],
  posts: PostRecord[],
  research: ResearchResult,
  today = dateKeyKst(),
): CategoryChoice {
  const shares = groupShares(posts);
  const scores: CategoryChoice['scores'] = [];

  if (!research.ok || research.items.length === 0) {
    return {
      category: FALLBACK_CATEGORY,
      reason: '조사 자료가 없어 부동산상식 콘텐츠로 대체합니다.',
      scores,
    };
  }

  // 조사 자료에 해당 카테고리 항목이 몇 개 있는지
  const itemCount = new Map<Category, number>();
  let topImportance = 0;
  let topImportanceCategory: Category | null = null;
  for (const item of research.items) {
    itemCount.set(item.category, (itemCount.get(item.category) ?? 0) + 1);
    if (item.importance > topImportance && candidates.includes(item.category)) {
      topImportance = item.importance;
      topImportanceCategory = item.category;
    }
  }

  for (const category of candidates) {
    const notes: string[] = [];
    let score = 0;

    // 1) 목표 비율 대비 부족분이 클수록 높은 점수
    const group = RATIO_GROUPS.find((g) => g.categories.includes(category));
    if (group) {
      const deficit = group.target - (shares.get(group.name) ?? 0);
      score += deficit * 2;
      notes.push(`${group.name} 부족분 ${(deficit * 100).toFixed(1)}%p`);
    }

    // 2) 조사 자료가 있는 카테고리를 우선
    const available = itemCount.get(category) ?? 0;
    if (available === 0) {
      score -= 0.25;
      notes.push('조사 자료 없음');
    } else {
      score += Math.min(available, 3) * 0.05;
      notes.push(`조사 자료 ${available}건`);
    }

    // 3) 최근에 쓴 카테고리는 뒤로
    const since = daysSinceCategory(posts, category, today);
    if (since === 0) {
      score -= 0.6;
      notes.push('오늘 이미 사용');
    } else if (since <= 2) {
      score -= 0.3;
      notes.push(`${since}일 전 사용`);
    } else if (Number.isFinite(since)) {
      notes.push(`${since}일 전 사용`);
    } else {
      score += 0.1;
      notes.push('사용 기록 없음');
    }

    // 4) 제이원플렉스는 최소 간격을 지킵니다. (전체의 5% 유지)
    if (category === '제이원플렉스' && since < MIN_DAYS_BETWEEN_POSTS) {
      score -= 10;
      notes.push(`최소 간격 ${MIN_DAYS_BETWEEN_POSTS}일 미달`);
    }

    // 5) 중요한 뉴스가 있으면 해당 카테고리를 크게 올립니다.
    if (topImportanceCategory === category && topImportance >= 4) {
      score += 0.5;
      notes.push(`중요 뉴스(중요도 ${topImportance})`);
    }

    scores.push({ category, score: Math.round(score * 1000) / 1000, note: notes.join(', ') });
  }

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  if (!best) {
    return { category: FALLBACK_CATEGORY, reason: '후보 카테고리가 없습니다.', scores };
  }

  return {
    category: best.category,
    reason: `${best.category} 선택 — ${best.note}`,
    scores,
  };
}

/** 다음 후보 카테고리 (중복 때문에 카테고리를 바꿔야 할 때 씁니다) */
export function nextCandidate(choice: CategoryChoice, exclude: Category[]): Category | null {
  const next = choice.scores.find((entry) => !exclude.includes(entry.category));
  return next ? next.category : null;
}
