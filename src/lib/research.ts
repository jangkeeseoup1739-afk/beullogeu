/**
 * [3] 최신 뉴스 자동 검색 / 조사 단계.
 *
 * 구조:
 *   1) 웹 검색 툴을 쓰는 호출로 오늘의 부동산 자료를 조사합니다 (자유 형식 + 출처 수집)
 *   2) 조사 내용을 구조화 출력으로 정리합니다 (검색 툴 없음)
 *
 * 왜 두 번 호출하나요?
 *   웹 검색 결과에는 인용 정보가 붙는데, 이는 구조화 출력(JSON 스키마 강제)과 함께 쓰면
 *   충돌할 수 있습니다. 그래서 "조사"와 "정리"를 분리했습니다. 두 번째 호출은 검색이 없어 저렴합니다.
 *
 * 비용 절약: 하루 첫 실행(09:00)이 종합 조사를 하고 결과를 저장합니다.
 * 13:00, 19:00 실행은 저장된 조사 결과를 재사용하고 필요한 주제만 가볍게 보강 검색합니다.
 */
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { MODEL } from './config';
import { getClient, runWithWebSearch, webSearchTool } from './claude';
import { ALL_CATEGORIES } from './categories';
import { MEDIA_DOMAINS, OFFICIAL_DOMAINS, publisherFromUrl } from './sources';
import { getStore } from './store';
import { dateKeyKst } from './time';
import { addUsage, emptyUsage, usageFromMessage } from './usage';
import { errorMessage } from './logger';
import type { Category, ResearchItem, ResearchResult, SourceRef, Slot } from './types';

const ResearchItemSchema = z.object({
  headline: z.string().describe('무슨 일이 있었는지 한 줄로'),
  summary: z.string().describe('핵심 내용 2~4문장. 기사 문장을 그대로 베끼지 말고 요약'),
  meaning: z.string().describe('부동산 시장에서 왜 중요한지, 어떤 의미가 있는지'),
  category: z.enum(ALL_CATEGORIES as [Category, ...Category[]]),
  region: z.string().nullable().describe('관련 지역. 전국 단위면 "전국"'),
  importance: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe('1=참고, 5=당일 최우선. 오래된 자료일수록 낮게 매긴다'),
  publishedAt: z
    .string()
    .nullable()
    .describe('자료가 발표·보도된 날짜 (YYYY-MM-DD). 확인되지 않으면 null'),
  verifiedFacts: z
    .array(z.string())
    .describe('조사 자료에서 실제로 확인된 숫자·일정·제도 내용만. 확인 안 된 내용은 넣지 않는다'),
  sourceUrls: z.array(z.string()).describe('이 항목의 근거가 된 URL'),
});

const ResearchSchema = z.object({
  items: z.array(ResearchItemSchema),
  notes: z.string().describe('조사 중 확인하지 못한 것이나 주의할 점'),
});

const RESEARCH_SYSTEM = `당신은 대한민국 부동산 시장을 매일 조사하는 리서처입니다.

조사 원칙:
- 기사 제목만 보고 판단하지 않는다. 본문과 공식 자료의 내용을 확인한다.
- 최신성이 가장 중요하다. 오늘부터 최근 3일 이내에 나온 자료를 우선 확인하고,
  그 기간에 자료가 없으면 최근 2주 이내까지만 범위를 넓힌다.
  몇 달 전 제도나 이미 시행 중인 내용을 '오늘의 소식'처럼 다루지 않는다.
  오래된 자료를 쓸 때는 언제 발표된 것인지 날짜를 반드시 함께 적는다.
- 다음 공식 출처를 먼저 확인한다: 국토교통부, 한국부동산원, 청약홈, LH, 주택도시보증공사,
  한국주택금융공사, 통계청, 기획재정부, 금융위원회, 금융감독원, 한국은행, 각 지방자치단체.
  그다음 주요 언론사의 부동산 보도를 확인한다.
- 숫자(가격, 거래량, 미분양, 입주물량, 금리, 세율, 분양가, 경쟁률)는 기준 시점을 함께 확인한다.
- 확인되지 않은 내용은 추측하지 않는다. 확인된 것과 확인되지 않은 것을 명확히 구분한다.
- 특정 정당이나 정치인을 지지하거나 비판하는 서술을 하지 않는다. 정책은 사실만 정리한다.
- 청약·분양은 입주자모집공고 등 공식 공고에서 확인된 내용을 우선한다.`;

function buildResearchPrompt(dateKey: string): string {
  return `오늘은 ${dateKey}(한국시간)입니다. 대한민국 부동산 시장의 최신 정보를 조사해 주세요.

먼저 "오늘 또는 어제 나온 부동산 뉴스"를 검색해 최신 소식부터 확보한 다음,
아래 영역을 확인하세요. 최근 3일 이내 자료를 우선하고, 없으면 최근 2주 이내까지만 봅니다.
1. 부동산 시장 주요 뉴스 (아파트 가격, 전세·월세, 매매시장, 거래량, 미분양, 입주물량, 주택 공급)
2. 정부 발표와 정책 변화 (국토교통부, 주택·공급 정책, 규제지역, 임대차 제도, 재건축·재개발)
3. 청약·분양 일정 (청약홈, LH, 신규 분양, 특별공급·일반공급, 무순위 청약, 당첨자 발표, 분양가)
4. 금융 (기준금리, 주택담보대출, 전세대출, 정책대출, LTV·DTI·DSR, 대출 규제 변화)
5. 세금 (취득세, 재산세, 종합부동산세, 양도소득세 등 제도 변화 — 최신 법령·정부 자료 기준)
6. 지역별 이슈 (서울, 경기, 인천, 부산, 대구, 광주, 대전, 울산, 세종, 제주 등에서 의미 있는 변화)
7. 상업용·수익형 부동산 (상가, 지식산업센터, 오피스텔, 물류센터, 오피스)

각 항목마다 다음을 분명히 적어 주세요.
- 무슨 일이 있었는지
- 확인된 숫자와 일정 (기준 시점 포함)
- 출처 기관 또는 매체와 URL
- 부동산 시장에서 어떤 의미가 있는지
- 실수요자나 투자자가 무엇을 확인해야 하는지

마지막에 "오늘 가장 중요한 항목" 순서대로 정리해 주세요.`;
}

/** 하루 종합 조사. 09:00 실행이 호출하고 결과를 저장합니다. */
export async function researchDaily(dateKey = dateKeyKst()): Promise<ResearchResult> {
  let usage = emptyUsage();

  // 1단계: 웹 검색으로 조사
  const research = await runWithWebSearch({
    model: MODEL.research,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    system: [{ type: 'text', text: RESEARCH_SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [webSearchTool(8)],
    messages: [{ role: 'user', content: buildResearchPrompt(dateKey) }],
  });
  usage = addUsage(usage, research.usage);

  const searchFailed = research.sources.length === 0 || research.text.length < 200;
  if (searchFailed) {
    return {
      dateKey,
      createdAt: new Date().toISOString(),
      items: [],
      ok: false,
      notes:
        research.searchErrors.length > 0
          ? `웹 검색 오류: ${research.searchErrors.join(', ')}`
          : '검색 결과가 충분하지 않아 조사에 실패했습니다.',
      usage,
    };
  }

  // 2단계: 구조화 정리 (검색 툴 없음)
  const structured = await structureResearch(dateKey, research.text, research.sources);
  usage = addUsage(usage, structured.usage);

  return {
    dateKey,
    createdAt: new Date().toISOString(),
    items: structured.items,
    ok: structured.items.length > 0,
    notes: structured.notes,
    usage,
  };
}

async function structureResearch(
  dateKey: string,
  researchText: string,
  sources: SourceRef[],
): Promise<{ items: ResearchItem[]; notes: string; usage: ReturnType<typeof emptyUsage> }> {
  const client = getClient();
  const sourceList = sources
    .slice(0, 40)
    .map((s, i) => `${i + 1}. ${s.title} (${s.publisher}) ${s.url}`)
    .join('\n');

  const response = await client.messages.parse({
    model: MODEL.research,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: zodOutputFormat(ResearchSchema) },
    system:
      '조사 자료를 구조화된 목록으로 정리합니다. 조사 자료에 없는 내용은 절대 추가하지 않습니다. ' +
      'verifiedFacts 에는 조사 자료에서 실제 확인된 숫자·일정만 넣습니다. sourceUrls 는 제공된 출처 목록에서만 고릅니다.',
    messages: [
      {
        role: 'user',
        content: `조사 날짜: ${dateKey}

[조사 자료]
${researchText}

[검색에서 확인된 출처 목록]
${sourceList}

위 조사 자료를 6~12개 항목으로 정리하세요. 중요도가 높은 것부터 나열하세요.
같은 사안을 여러 항목으로 쪼개지 마세요.
발표·보도 날짜가 확인되면 publishedAt 에 적고, 오래된 자료는 중요도를 낮게 매기세요.`,
      },
    ],
  });

  const usage = usageFromMessage(response.usage);
  const parsed = response.parsed_output;
  if (!parsed) {
    return { items: [], notes: '조사 결과 정리에 실패했습니다.', usage };
  }

  const urlToSource = new Map(sources.map((s) => [s.url, s]));
  const items: ResearchItem[] = parsed.items.map((item) => ({
    headline: item.headline,
    summary: item.summary,
    meaning: item.meaning,
    category: item.category,
    region: item.region ?? undefined,
    publishedAt: item.publishedAt ?? undefined,
    importance: item.importance,
    verifiedFacts: item.verifiedFacts,
    sources: item.sourceUrls
      .map(
        (url) =>
          urlToSource.get(url) ?? {
            title: url,
            url,
            publisher: publisherFromUrl(url),
          },
      )
      .slice(0, 5),
  }));

  return { items, notes: parsed.notes, usage };
}

/**
 * 슬롯별 보강 검색.
 * 저장된 하루 조사 결과에 해당 슬롯에서 필요한 주제만 가볍게 덧붙입니다.
 */
export async function topUpResearch(
  dateKey: string,
  slot: Slot,
  categories: Category[],
  base: ResearchResult,
): Promise<ResearchResult> {
  const focus = categories.join(', ');
  const known = base.items
    .slice(0, 12)
    .map((item) => `- [${item.category}] ${item.headline}`)
    .join('\n');

  const research = await runWithWebSearch({
    model: MODEL.research,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: [{ type: 'text', text: RESEARCH_SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [webSearchTool(3)],
    messages: [
      {
        role: 'user',
        content: `오늘은 ${dateKey}(한국시간)입니다. 이미 확인한 내용은 아래와 같습니다.

${known || '(없음)'}

지금은 ${focus} 주제로 글을 쓰려고 합니다. 이 주제에 대해 아직 확인하지 못한 최신 정보를 추가로 조사해 주세요.
공식 자료(청약홈, LH, 국토교통부, 한국부동산원, 금융위원회, 기획재정부 등)를 우선 확인하고,
확인된 숫자와 일정, 출처 URL을 함께 정리해 주세요. 확인되지 않은 내용은 추측하지 마세요.`,
      },
    ],
  });

  if (research.sources.length === 0 || research.text.length < 120) {
    // 보강 실패는 문제가 아닙니다. 기존 조사 결과로 글을 씁니다.
    return { ...base, usage: addUsage(base.usage, research.usage) };
  }

  const structured = await structureResearch(dateKey, research.text, research.sources);
  const merged = mergeResearch(base, structured.items);

  return {
    ...merged,
    usage: addUsage(addUsage(base.usage, research.usage), structured.usage),
    notes: [base.notes, structured.notes].filter(Boolean).join(' / '),
  };
}

function mergeResearch(base: ResearchResult, extra: ResearchItem[]): ResearchResult {
  const existing = new Set(base.items.map((item) => item.headline.trim()));
  const merged = [...base.items];
  for (const item of extra) {
    if (!existing.has(item.headline.trim())) merged.push(item);
  }
  return { ...base, items: merged, ok: merged.length > 0 };
}

/**
 * 조사 결과를 가져옵니다. 저장된 것이 있으면 재사용하고, 없으면 새로 조사합니다.
 * 조사 자체가 실패해도 예외를 던지지 않습니다. ok=false 인 결과를 돌려줍니다.
 */
export async function getResearchForSlot(
  slot: Slot,
  categories: Category[],
  dateKey = dateKeyKst(),
): Promise<ResearchResult> {
  const store = getStore();
  let base: ResearchResult | null = null;

  try {
    base = await store.getResearch(dateKey);
  } catch (error) {
    console.error('저장된 조사 결과 읽기 실패:', errorMessage(error));
  }

  if (!base || !base.ok) {
    base = await researchDaily(dateKey);
    if (base.ok) {
      try {
        await store.saveResearch(base);
      } catch (error) {
        console.error('조사 결과 저장 실패:', errorMessage(error));
      }
    }
    return base;
  }

  // 오늘 조사 결과가 이미 있으면 슬롯 주제만 보강합니다.
  try {
    const topped = await topUpResearch(dateKey, slot, categories, base);
    if (topped.items.length > base.items.length) {
      await store.saveResearch(topped);
    }
    return topped;
  } catch (error) {
    console.error('보강 조사 실패, 기존 조사 결과를 사용합니다:', errorMessage(error));
    return base;
  }
}

/** 조사 항목 중 특정 카테고리에 맞는 것을 중요도 순으로 고릅니다. */
export function pickItemsForCategory(
  research: ResearchResult,
  category: Category,
  limit = 3,
): ResearchItem[] {
  const exact = research.items.filter((item) => item.category === category);
  const sorted = [...exact].sort((a, b) => b.importance - a.importance);
  if (sorted.length >= 1) return sorted.slice(0, limit);
  // 정확히 맞는 항목이 없으면 중요도 높은 순으로 대체합니다.
  return [...research.items].sort((a, b) => b.importance - a.importance).slice(0, limit);
}
