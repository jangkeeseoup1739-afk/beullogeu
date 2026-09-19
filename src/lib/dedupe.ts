/**
 * [10] 게시물 중복 방지.
 *
 * 한국어 형태소 분석기를 쓰지 않고 문자 3-gram 유사도(Jaccard)로 판정합니다.
 * 외부 라이브러리 없이도 한국어 문장 유사도를 충분히 잡아내고, 설치·유지 부담이 없습니다.
 *
 * 판정 기준
 *  - 본문 유사도 0.55 이상 (최근 30일)
 *  - 첫 문장 유사도 0.60 이상 (최근 30일)
 *  - 같은 주제키 (최근 7일)
 *  - 같은 출처 URL 재사용 (최근 14일)
 *  - 같은 카테고리에서 키워드가 80% 이상 겹침 (최근 14일)
 */
import { dateKeyKst, daysBetween } from './time';
import type { DedupeResult, PostRecord } from './types';

const TEXT_SIMILARITY_LIMIT = 0.55;
const HOOK_SIMILARITY_LIMIT = 0.6;
const KEYWORD_OVERLAP_LIMIT = 0.8;

export const DEDUPE_WINDOW_DAYS = 30;
const TOPIC_WINDOW_DAYS = 7;
const SOURCE_WINDOW_DAYS = 14;
const KEYWORD_WINDOW_DAYS = 14;

/** 비교에 방해가 되는 문자를 걷어내고 한글·영문·숫자만 남깁니다. */
export function normalizeKorean(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^0-9A-Za-z가-힣]/g, '')
    .toLowerCase();
}

export function trigrams(text: string): Set<string> {
  const normalized = normalizeKorean(text);
  const grams = new Set<string>();
  if (normalized.length <= 3) {
    if (normalized) grams.add(normalized);
    return grams;
  }
  for (let i = 0; i <= normalized.length - 3; i++) {
    grams.add(normalized.slice(i, i + 3));
  }
  return grams;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const gram of a) {
    if (b.has(gram)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function textSimilarity(a: string, b: string): number {
  return jaccard(trigrams(a), trigrams(b));
}

function keywordOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b.map((k) => normalizeKorean(k)));
  const matched = a.filter((k) => setB.has(normalizeKorean(k))).length;
  return matched / a.length;
}

export interface DedupeCandidate {
  text: string;
  hook: string;
  topicKey: string;
  keywords: string[];
  sourceUrls: string[];
  category: string;
}

/** 후보 글이 과거 게시물과 겹치는지 검사합니다. */
export function checkDuplicate(
  candidate: DedupeCandidate,
  history: PostRecord[],
  attempts = 0,
  today = dateKeyKst(),
): DedupeResult {
  // 보류·취소된 글은 게시된 적이 없으므로 비교 대상에서 제외합니다.
  const comparable = history.filter(
    (post) => post.status === 'published' || post.status === 'pending_approval',
  );

  let maxSimilarity = 0;
  let similarPostId: string | undefined;

  for (const post of comparable) {
    const age = daysBetween(today, post.dateKey);

    if (age <= TOPIC_WINDOW_DAYS && post.topicKey && post.topicKey === candidate.topicKey) {
      return {
        isDuplicate: true,
        comparedCount: comparable.length,
        maxSimilarity: 1,
        reason: `${age}일 전에 같은 주제키(${post.topicKey})로 올린 글이 있습니다.`,
        similarPostId: post.id,
        attempts,
      };
    }

    if (age <= SOURCE_WINDOW_DAYS && candidate.sourceUrls.length > 0) {
      const postUrls = new Set(post.sources.map((s) => s.url));
      const shared = candidate.sourceUrls.filter((url) => postUrls.has(url));
      if (shared.length > 0) {
        return {
          isDuplicate: true,
          comparedCount: comparable.length,
          maxSimilarity: 1,
          reason: `${age}일 전 글과 같은 출처를 다시 사용했습니다. (${shared[0]})`,
          similarPostId: post.id,
          attempts,
        };
      }
    }

    if (age <= DEDUPE_WINDOW_DAYS) {
      const bodySimilarity = textSimilarity(candidate.text, post.text);
      if (bodySimilarity > maxSimilarity) {
        maxSimilarity = bodySimilarity;
        similarPostId = post.id;
      }
      if (bodySimilarity >= TEXT_SIMILARITY_LIMIT) {
        return {
          isDuplicate: true,
          comparedCount: comparable.length,
          maxSimilarity: bodySimilarity,
          reason: `${age}일 전 글과 본문이 ${Math.round(bodySimilarity * 100)}% 비슷합니다.`,
          similarPostId: post.id,
          attempts,
        };
      }

      const hookSimilarity = textSimilarity(candidate.hook, post.hook);
      if (hookSimilarity >= HOOK_SIMILARITY_LIMIT) {
        return {
          isDuplicate: true,
          comparedCount: comparable.length,
          maxSimilarity: Math.max(maxSimilarity, hookSimilarity),
          reason: `${age}일 전 글과 첫 문장이 ${Math.round(hookSimilarity * 100)}% 비슷합니다.`,
          similarPostId: post.id,
          attempts,
        };
      }
    }

    if (age <= KEYWORD_WINDOW_DAYS && post.category === candidate.category) {
      const overlap = keywordOverlap(candidate.keywords, post.keywords);
      if (overlap >= KEYWORD_OVERLAP_LIMIT) {
        return {
          isDuplicate: true,
          comparedCount: comparable.length,
          maxSimilarity: Math.max(maxSimilarity, overlap),
          reason: `${age}일 전 같은 카테고리 글과 키워드가 ${Math.round(overlap * 100)}% 겹칩니다.`,
          similarPostId: post.id,
          attempts,
        };
      }
    }
  }

  return {
    isDuplicate: false,
    comparedCount: comparable.length,
    maxSimilarity: Math.round(maxSimilarity * 1000) / 1000,
    similarPostId,
    attempts,
  };
}
