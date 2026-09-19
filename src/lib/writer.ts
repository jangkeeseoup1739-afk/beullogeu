/**
 * [4][6][18] 콘텐츠 작성 단계.
 *
 * 조사 결과를 Threads 게시물로 다시 씁니다. 뉴스를 그대로 복사하지 않고
 * "무슨 일이 있었는지 → 왜 중요한지 → 시장에 어떤 의미인지 → 무엇을 확인해야 하는지"
 * 구조로 재구성합니다.
 *
 * 스타일 규칙은 고정된 시스템 프롬프트에 두고 캐시합니다(프롬프트 캐싱).
 * 매 호출마다 바뀌는 내용(날짜, 조사 자료, 최근 게시물)은 사용자 메시지에 둡니다.
 */
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { MODEL } from './config';
import { getClient } from './claude';
import { ALL_CATEGORIES, CATEGORY_CHECKLIST } from './categories';
import { publisherFromUrl } from './sources';
import { availableFacts, forbiddenTopics, INFO_ANGLES, PROJECT_NAME } from './jwonplex';
import { usageFromMessage } from './usage';
import type { Category, PostRecord, ResearchItem, SourceRef, Slot, UsageRecord } from './types';

/** Threads 텍스트 게시물 최대 길이 */
export const THREADS_MAX_CHARS = 500;

const DraftSchema = z.object({
  text: z
    .string()
    .describe('Threads에 올릴 본문. 500자 이내, 3~8문장. 해시태그와 링크는 넣지 않는다'),
  hook: z.string().describe('본문의 첫 문장 (관심을 끄는 한 줄)'),
  category: z.enum(ALL_CATEGORIES as [Category, ...Category[]]),
  topicKey: z
    .string()
    .describe('중복 검사용 주제 키. "카테고리|지역|핵심소재" 형식의 짧은 문자열'),
  keywords: z.array(z.string()).describe('핵심 키워드 3~6개'),
  usedFacts: z.array(z.string()).describe('본문에 사용한 사실과 숫자. 조사 자료에서 확인된 것만'),
  sourceUrls: z.array(z.string()).describe('근거가 된 출처 URL'),
  sourceLabel: z
    .string()
    .nullable()
    .describe('본문 끝에 표시할 출처 표기. 예: "출처: 국토교통부". 필요 없으면 null'),
});

export type Draft = z.infer<typeof DraftSchema>;

const WRITER_SYSTEM = `당신은 대한민국 부동산 정보를 다루는 Threads 채널의 글을 씁니다.
특정 상품을 홍보하는 계정이 아니라, 부동산 전반의 정보를 다루는 전문 채널입니다.

[글의 목적]
단순히 뉴스를 전달하지 않습니다. 뉴스를 보고 사람들이 실제로 궁금해할 내용을 설명합니다.
뉴스 전달 + 부동산 해석 + 실생활 정보 + 시장 흐름을 결합합니다.

[기본 구조]
1) 무슨 일이 있었는지
2) 왜 중요한지
3) 부동산 시장에 어떤 의미가 있는지
4) 사람들이 무엇을 확인해야 하는지
네 가지를 기계적으로 나열하지 말고 자연스러운 글로 엮습니다.

[문장 규칙]
- 첫 문장은 반드시 관심을 끌 수 있게 씁니다. 다만 같은 표현을 반복하지 않습니다.
- 기본 3~8문장. 500자를 넘기지 않습니다. 한 게시물에 너무 많은 정보를 넣지 않습니다.
- 존댓말(~습니다, ~합니다)로 씁니다.
- 광고 문구처럼 쓰지 않습니다. 실제 부동산에 관심 있는 사람이 쓴 것처럼 자연스럽게 씁니다.
- 해시태그, 링크, 이모지, 굵은 글씨 표시(**)를 쓰지 않습니다.
- 기사 문장을 그대로 베끼지 않습니다. 내용을 이해한 뒤 다시 씁니다.

[사실관계]
- 숫자, 일정, 제도 내용은 조사 자료에서 확인된 것만 씁니다. 확인되지 않은 것은 아예 쓰지 않습니다.
- 통계와 가격은 기준 시점을 함께 밝힙니다. (예: 8월 기준)
- 추측이 필요한 부분은 "확인이 필요합니다", "공고를 확인해야 합니다" 처럼 확인을 권하는 문장으로 처리합니다.

[정치적 중립]
- 특정 정당이나 정치인을 지지하거나 비판하지 않습니다. 정치인 이름과 정당명을 쓰지 않습니다.
- 정책은 사실을 중심으로 설명합니다. "좋다", "나쁘다", "최고", "최악" 같은 평가를 임의로 하지 않습니다.
- 전문가 의견을 인용할 때는 사실과 의견을 구분해서 씁니다. 단정적인 시장 예측을 하지 않습니다.

[금지]
- 단정적 표현: 무조건, 반드시 오릅니다, 절대, 확실합니다, 폭등, 폭락합니다
- 투자 권유: 지금 사야 합니다, 마지막 기회, 놓치면 후회
- 과장 표현: 최고, 최저가, 초특가, 대박`;

function categoryGuidance(category: Category): string {
  const checklist = CATEGORY_CHECKLIST[category];
  if (checklist) return `[${category} 작성 지침]\n${checklist}`;
  if (category === '부동산상식') {
    return `[부동산상식 작성 지침]
최신 숫자나 일정에 의존하지 않는 일반 원리를 설명합니다.
구체적인 시세, 세율, 일정을 단정적으로 쓰지 않습니다. 확인 방법과 판단 기준을 알려 줍니다.`;
  }
  if (category === '제이원플렉스') {
    return `[제이원플렉스 작성 지침]
프로젝트명: ${PROJECT_NAME}
광고만 하지 않습니다. 먼저 정보형 내용으로 시작하고, 그 흐름 안에서 자연스럽게 언급합니다.
정보형 주제 예시: ${INFO_ANGLES.join(' / ')}

쓸 수 있는 확정 사실 (이 목록 안에서만 씁니다):
${availableFacts()
  .map((fact) => `- ${fact}`)
  .join('\n')}

절대 쓰지 않는 항목 (최신 제공자료가 없으므로 추측 금지):
${forbiddenTopics()
  .map((topic) => `- ${topic}`)
  .join('\n')}

분양가, 대출, 세금, 계약조건, 잔여호실, 정확한 거리는 언급하지 않습니다.
"문의", "상담", "연락" 같은 영업 문구를 쓰지 않습니다.`;
  }
  return `[${category} 작성 지침]\n확인된 사실을 바탕으로 쓰고, 독자가 직접 확인할 방법을 알려 줍니다.`;
}

function formatResearchItems(items: ResearchItem[]): string {
  if (items.length === 0) return '(조사 자료 없음)';
  return items
    .map((item, index) => {
      const facts = item.verifiedFacts.length
        ? item.verifiedFacts.map((f) => `    · ${f}`).join('\n')
        : '    · (확인된 숫자 없음)';
      const sources = item.sources.map((s) => `    · ${s.publisher} ${s.url}`).join('\n');
      return `${index + 1}. [${item.category}${item.region ? `/${item.region}` : ''}] ${item.headline}
  요약: ${item.summary}
  의미: ${item.meaning}
  중요도: ${item.importance}/5
  확인된 사실:
${facts}
  출처:
${sources}`;
    })
    .join('\n\n');
}

function formatRecentPosts(recent: PostRecord[]): string {
  if (recent.length === 0) return '(최근 게시물 없음)';
  return recent
    .slice(0, 20)
    .map((post) => `- ${post.dateKey} [${post.category}] ${post.hook} (주제키: ${post.topicKey})`)
    .join('\n');
}

export interface WriteRequest {
  dateKey: string;
  slot: Slot;
  category: Category;
  items: ResearchItem[];
  recentPosts: PostRecord[];
  /** 재작성일 때 이유를 넣습니다. (중복, 검증 실패) */
  rewriteReason?: string;
  /** 재작성 시 피해야 할 이전 본문 */
  previousText?: string;
}

export interface WriteResult {
  draft: Draft | null;
  sources: SourceRef[];
  usage: UsageRecord;
  error?: string;
}

export async function writeDraft(request: WriteRequest): Promise<WriteResult> {
  const client = getClient();
  const rewriteBlock = request.rewriteReason
    ? `\n[재작성 요청]
이전 글에 문제가 있어 다시 씁니다. 이유: ${request.rewriteReason}
이전 글:
"""
${request.previousText ?? ''}
"""
같은 소재를 쓰더라도 관점, 첫 문장, 구성을 분명히 다르게 바꿔 주세요.\n`
    : '';

  try {
    const response = await client.messages.parse({
      model: MODEL.writer,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: zodOutputFormat(DraftSchema) },
      system: [{ type: 'text', text: WRITER_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: `오늘은 ${request.dateKey}(한국시간)이고, 지금 쓰는 글의 카테고리는 "${request.category}" 입니다.

${categoryGuidance(request.category)}

[오늘 조사한 자료]
${formatResearchItems(request.items)}

[최근에 올린 글 — 소재와 표현이 겹치지 않게 해주세요]
${formatRecentPosts(request.recentPosts)}
${rewriteBlock}
위 조사 자료 안에서 가장 의미 있는 하나의 소재를 골라 Threads 게시물 한 개를 작성하세요.
- 조사 자료에 없는 숫자나 일정은 절대 넣지 마세요.
- 본문은 500자 이내, 3~8문장으로 쓰세요.
- usedFacts 에는 본문에서 실제로 사용한 사실을 그대로 적어 주세요.
- sourceUrls 에는 조사 자료의 출처 URL만 적어 주세요.`,
        },
      ],
    });

    const usage = usageFromMessage(response.usage);
    const draft = response.parsed_output;
    if (!draft) {
      return { draft: null, sources: [], usage, error: '콘텐츠 생성 결과를 해석하지 못했습니다.' };
    }

    const knownSources = new Map<string, SourceRef>();
    for (const item of request.items) {
      for (const source of item.sources) knownSources.set(source.url, source);
    }
    const sources: SourceRef[] = draft.sourceUrls.map(
      (url) =>
        knownSources.get(url) ?? { title: url, url, publisher: publisherFromUrl(url) },
    );

    return { draft, sources, usage };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { draft: null, sources: [], usage: usageFromMessage(null), error: message };
  }
}

/**
 * 조사에 실패했을 때 쓰는 대체 글 ([15]).
 * 최신 숫자에 의존하지 않는 부동산 상식이라 검색 없이도 안전하게 쓸 수 있습니다.
 */
export async function writeFallbackDraft(
  dateKey: string,
  slot: Slot,
  recentPosts: PostRecord[],
): Promise<WriteResult> {
  const client = getClient();
  try {
    const response = await client.messages.parse({
      model: MODEL.writer,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: zodOutputFormat(DraftSchema) },
      system: [{ type: 'text', text: WRITER_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: `오늘은 ${dateKey}(한국시간)입니다. 최신 자료 조사가 되지 않아 부동산 상식 글을 씁니다.

[최근에 올린 글 — 소재가 겹치지 않게 해주세요]
${formatRecentPosts(recentPosts)}

조건:
- category 는 반드시 "부동산상식" 으로 지정하세요.
- 최신 시세, 세율, 일정, 통계 숫자를 쓰지 마세요. 확인 시점이 없는 숫자는 넣지 않습니다.
- 실수요자가 알아 두면 도움이 되는 판단 기준이나 확인 방법을 설명하세요.
  (예: 입주물량과 미분양을 함께 봐야 하는 이유, 전세가율을 보는 방법,
   등기부등본에서 확인할 것, 계약 전 확인 순서, 분양가 외에 확인할 비용 등)
- sourceUrls 는 빈 배열로, sourceLabel 은 null 로 두세요.
- 본문은 500자 이내, 3~8문장입니다.`,
        },
      ],
    });
    const usage = usageFromMessage(response.usage);
    const draft = response.parsed_output;
    if (!draft) {
      return { draft: null, sources: [], usage, error: '대체 콘텐츠 생성에 실패했습니다.' };
    }
    return { draft: { ...draft, category: '부동산상식' }, sources: [], usage };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { draft: null, sources: [], usage: usageFromMessage(null), error: message };
  }
}
