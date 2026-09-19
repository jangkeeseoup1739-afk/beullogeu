/**
 * Anthropic API 호출 공통 처리.
 *
 * - 클라이언트 생성 (API 키는 환경 변수에서만 읽습니다)
 * - 서버 사이드 웹 검색을 쓰는 호출에서 pause_turn 재개 처리
 * - 검색 결과에서 출처 URL 수집
 * - 검색 툴 오류는 예외가 아니라 결과 블록으로 오기 때문에 따로 구분합니다
 */
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from './config';
import { publisherFromUrl } from './sources';
import { emptyUsage, usageFromMessage, addUsage } from './usage';
import type { SourceRef, UsageRecord } from './types';

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (client) return client;
  const { config } = loadConfig();
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY 가 설정되지 않았습니다.');
  }
  client = new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 3 });
  return client;
}

/** 한국 기준 검색 결과를 받기 위한 위치 설정 */
export const KOREA_LOCATION = {
  type: 'approximate' as const,
  country: 'KR',
  timezone: 'Asia/Seoul',
};

export function webSearchTool(maxUses: number): Anthropic.WebSearchTool20260209 {
  return {
    type: 'web_search_20260209',
    name: 'web_search',
    max_uses: maxUses,
    user_location: KOREA_LOCATION,
  };
}

export interface ToolRunOutcome {
  text: string;
  sources: SourceRef[];
  usage: UsageRecord;
  /** 검색 툴이 오류를 돌려준 경우의 오류 코드들 */
  searchErrors: string[];
  stopReason: string | null;
}

/**
 * 웹 검색 툴을 쓰는 호출.
 * 검색이 오래 걸리면 stop_reason 이 'pause_turn' 으로 끊길 수 있으므로
 * 끊긴 지점부터 이어서 호출합니다. (최대 4회)
 */
export async function runWithWebSearch(
  params: Anthropic.MessageCreateParamsNonStreaming,
  maxResumes = 4,
): Promise<ToolRunOutcome> {
  const anthropic = getClient();
  const messages: Anthropic.MessageParam[] = [...(params.messages ?? [])];
  let usage = emptyUsage();
  const sources: SourceRef[] = [];
  const searchErrors: string[] = [];
  const textParts: string[] = [];
  let stopReason: string | null = null;

  for (let attempt = 0; attempt <= maxResumes; attempt++) {
    const message = await anthropic.messages.create({ ...params, messages });
    usage = addUsage(usage, usageFromMessage(message.usage));
    stopReason = message.stop_reason ?? null;

    for (const block of message.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
      } else if (block.type === 'web_search_tool_result') {
        // 성공이면 content 가 배열, 오류면 단일 객체입니다.
        if (Array.isArray(block.content)) {
          for (const result of block.content) {
            if (result.type === 'web_search_result') {
              sources.push({
                title: result.title || result.url,
                url: result.url,
                publisher: publisherFromUrl(result.url),
                publishedAt: result.page_age ?? undefined,
              });
            }
          }
        } else if (block.content && typeof block.content === 'object') {
          const code = (block.content as { error_code?: string }).error_code;
          searchErrors.push(code ?? 'unknown_search_error');
        }
      }
    }

    // 안전 중단: 거부 응답이면 바로 종료합니다.
    if (message.stop_reason === 'refusal') {
      searchErrors.push('refusal');
      break;
    }

    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: message.content });
      continue;
    }
    break;
  }

  return {
    text: textParts.join('\n\n').trim(),
    sources: dedupeSources(sources),
    usage,
    searchErrors,
    stopReason,
  };
}

export function dedupeSources(sources: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const source of sources) {
    if (!source.url || seen.has(source.url)) continue;
    seen.add(source.url);
    out.push(source);
  }
  return out;
}

/** 구조화 출력 응답에서 텍스트만 모읍니다. (오류 메시지 확인용) */
export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}
