/**
 * [7] 사실관계와 정치적 중립 검증.
 *
 * 두 종류의 검사를 합니다.
 *  1) 규칙 검사 — 코드로 확실하게 판정 (길이, 금지 표현, 해시태그, 출처 유무 등)
 *  2) 대조 검증 — 본문의 숫자·일정·제도 내용이 조사 자료에 실제로 있는지 Claude가 문장 단위로 확인
 *
 * 규칙 검사에서 걸리면 재작성, 대조 검증에서 근거 없는 문장이 나오면 재작성,
 * 그래도 통과하지 못하면 게시하지 않고 보류(held)합니다.
 */
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { MODEL } from './config';
import { getClient } from './claude';
import { usageFromMessage } from './usage';
import { THREADS_MAX_CHARS } from './writer';
import type { Category, ResearchItem, UsageRecord, VerificationResult } from './types';

/** 쓰면 안 되는 표현 ([6][7]) */
const BANNED_PHRASES: string[] = [
  '무조건',
  '반드시 오릅니다',
  '절대 안전',
  '확실합니다',
  '폭등',
  '폭락합니다',
  '지금 사야',
  '마지막 기회',
  '놓치면 후회',
  '초특가',
  '최저가',
  '대박',
  '강추',
  '문의 주세요',
  '상담 문의',
  '선착순',
];

/** 정치적 표현 ([7]) */
const POLITICAL_TERMS: string[] = [
  '국민의힘',
  '더불어민주당',
  '조국혁신당',
  '개혁신당',
  '진보당',
  '정의당',
  '여당',
  '야당',
  '정권',
  '좌파',
  '우파',
  '탄핵',
];

/** 출처가 반드시 있어야 하는 카테고리 (최신 자료 기반 글) */
const SOURCE_REQUIRED: Category[] = [
  'NEWS',
  '정책',
  '청약',
  '분양',
  '세금',
  '대출',
  '시장분석',
  '전세',
  '월세',
  '재개발',
  '재건축',
];

export interface RuleCheckInput {
  text: string;
  hook: string;
  category: Category;
  sourceCount: number;
}

/** 규칙 검사. 코드로 확실히 판정할 수 있는 항목만 봅니다. */
export function checkRules(input: RuleCheckInput): string[] {
  const issues: string[] = [];
  const text = input.text.trim();

  if (text.length === 0) {
    issues.push('본문이 비어 있습니다.');
    return issues;
  }
  if (text.length > THREADS_MAX_CHARS) {
    issues.push(`본문이 ${text.length}자입니다. Threads 제한인 ${THREADS_MAX_CHARS}자를 넘습니다.`);
  }

  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length < 3) {
    issues.push(`문장이 ${sentences.length}개입니다. 3문장 이상으로 써야 합니다.`);
  }
  if (sentences.length > 10) {
    issues.push(`문장이 ${sentences.length}개입니다. 너무 많은 정보가 들어 있습니다.`);
  }

  if (/#[^\s#]+/.test(text)) issues.push('해시태그가 들어 있습니다.');
  if (/https?:\/\//.test(text)) issues.push('본문에 링크가 들어 있습니다.');
  if (/\*\*/.test(text)) issues.push('굵은 글씨 표시(**)가 들어 있습니다.');

  for (const phrase of BANNED_PHRASES) {
    if (text.includes(phrase)) issues.push(`금지 표현이 있습니다: "${phrase}"`);
  }
  for (const term of POLITICAL_TERMS) {
    if (text.includes(term)) issues.push(`정치적 표현이 있습니다: "${term}"`);
  }

  if (!input.hook || !text.startsWith(input.hook.trim().slice(0, 6))) {
    // 첫 문장은 본문 맨 앞에 있어야 합니다. (관리자 화면에서 첫 문장만 보고 판단하기 때문)
    issues.push('hook(첫 문장)이 본문의 시작과 맞지 않습니다.');
  }

  if (SOURCE_REQUIRED.includes(input.category) && input.sourceCount === 0) {
    issues.push(`${input.category} 카테고리는 출처가 최소 1개 필요합니다.`);
  }

  return issues;
}

const FactCheckSchema = z.object({
  unsupportedSentences: z
    .array(z.string())
    .describe('조사 자료에서 근거를 찾을 수 없는 문장. 없으면 빈 배열'),
  politicalIssues: z
    .array(z.string())
    .describe('특정 정당·정치인 지지나 비판, 임의의 정책 평가로 보이는 표현. 없으면 빈 배열'),
  confidence: z.number().min(0).max(1).describe('본문 전체가 조사 자료와 일치하는 정도'),
  notes: z.string().describe('판정 근거를 한두 문장으로'),
});

export interface FactCheckResult {
  verification: VerificationResult;
  usage: UsageRecord;
}

/**
 * 대조 검증. 본문에 있는 사실이 조사 자료에 실제로 있는지 확인합니다.
 * 조사 자료가 없는 글(부동산상식)은 숫자·일정이 없어야 하므로 그 관점으로 검사합니다.
 */
export async function checkFacts(
  text: string,
  items: ResearchItem[],
  category: Category,
  ruleIssues: string[],
): Promise<FactCheckResult> {
  const client = getClient();
  const reference =
    items.length > 0
      ? items
          .map(
            (item, index) =>
              `${index + 1}. ${item.headline}\n   요약: ${item.summary}\n   확인된 사실: ${
                item.verifiedFacts.join(' | ') || '(없음)'
              }\n   출처: ${item.sources.map((s) => s.publisher).join(', ')}`,
          )
          .join('\n')
      : '(조사 자료 없음 — 이 글은 최신 숫자나 일정을 담고 있으면 안 됩니다)';

  try {
    const response = await client.messages.parse({
      model: MODEL.verifier,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: zodOutputFormat(FactCheckSchema) },
      system:
        '부동산 게시물의 사실관계를 검증합니다. 본문의 숫자, 일정, 제도 내용, 지역명이 ' +
        '조사 자료에서 확인되는지 문장 단위로 확인하고, 근거가 없는 문장을 그대로 인용해 보고합니다. ' +
        '조사 자료에 없는 내용을 "상식적으로 맞다"는 이유로 통과시키지 않습니다. ' +
        '일반적인 설명이나 확인을 권하는 문장은 숫자가 없다면 문제 없는 것으로 봅니다.',
      messages: [
        {
          role: 'user',
          content: `[카테고리]
${category}

[조사 자료]
${reference}

[검증할 본문]
"""
${text}
"""

본문의 각 문장을 조사 자료와 대조하세요.
- 조사 자료에 없는 숫자·일정·세율·제도 내용이 있으면 unsupportedSentences 에 그 문장을 넣으세요.
- 특정 정당·정치인에 대한 지지나 비판, 근거 없는 정책 평가가 있으면 politicalIssues 에 넣으세요.`,
        },
      ],
    });

    const usage = usageFromMessage(response.usage);
    const parsed = response.parsed_output;
    if (!parsed) {
      return {
        verification: {
          passed: false,
          ruleIssues,
          unsupportedSentences: [],
          politicalIssues: [],
          confidence: 0,
          notes: '검증 응답을 해석하지 못했습니다.',
        },
        usage,
      };
    }

    const passed =
      ruleIssues.length === 0 &&
      parsed.unsupportedSentences.length === 0 &&
      parsed.politicalIssues.length === 0 &&
      parsed.confidence >= 0.7;

    return {
      verification: {
        passed,
        ruleIssues,
        unsupportedSentences: parsed.unsupportedSentences,
        politicalIssues: parsed.politicalIssues,
        confidence: parsed.confidence,
        notes: parsed.notes,
      },
      usage,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 검증 호출 자체가 실패하면 통과시키지 않습니다. 잘못된 정보가 올라가는 것이 더 큰 문제입니다.
    return {
      verification: {
        passed: false,
        ruleIssues,
        unsupportedSentences: [],
        politicalIssues: [],
        confidence: 0,
        notes: `검증 호출 실패: ${message}`,
      },
      usage: usageFromMessage(null),
    };
  }
}

/** 검증 결과를 사람이 읽을 수 있는 한 줄로 요약합니다. */
export function summarizeVerification(verification: VerificationResult): string {
  if (verification.passed) return `통과 (일치도 ${Math.round(verification.confidence * 100)}%)`;
  const parts: string[] = [];
  if (verification.ruleIssues.length) parts.push(`규칙 ${verification.ruleIssues.length}건`);
  if (verification.unsupportedSentences.length)
    parts.push(`근거없는 문장 ${verification.unsupportedSentences.length}건`);
  if (verification.politicalIssues.length)
    parts.push(`정치적 표현 ${verification.politicalIssues.length}건`);
  return `보류 (${parts.join(', ') || verification.notes})`;
}
