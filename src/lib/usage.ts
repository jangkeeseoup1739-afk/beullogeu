/**
 * 토큰 사용량 집계와 비용 추정.
 * 실행 기록에 저장해 두고 실제 비용을 확인하는 데 씁니다.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { PRICING } from './config';
import type { UsageRecord } from './types';

export function emptyUsage(): UsageRecord {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    webSearchCount: 0,
    estimatedUsd: 0,
  };
}

export function usageFromMessage(usage: Anthropic.Usage | undefined | null): UsageRecord {
  if (!usage) return emptyUsage();
  const record: UsageRecord = {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    webSearchCount: usage.server_tool_use?.web_search_requests ?? 0,
    estimatedUsd: 0,
  };
  record.estimatedUsd = estimateUsd(record);
  return record;
}

export function addUsage(a: UsageRecord, b: UsageRecord): UsageRecord {
  const merged: UsageRecord = {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    webSearchCount: a.webSearchCount + b.webSearchCount,
    estimatedUsd: 0,
  };
  merged.estimatedUsd = estimateUsd(merged);
  return merged;
}

export function estimateUsd(usage: UsageRecord): number {
  const perMillion = 1_000_000;
  const cost =
    (usage.inputTokens / perMillion) * PRICING.input +
    (usage.outputTokens / perMillion) * PRICING.output +
    (usage.cacheReadTokens / perMillion) * PRICING.cacheRead +
    (usage.cacheWriteTokens / perMillion) * PRICING.cacheWrite +
    usage.webSearchCount * PRICING.webSearchPerCall;
  return Math.round(cost * 10000) / 10000;
}

export function formatUsage(usage: UsageRecord): string {
  return `입력 ${usage.inputTokens.toLocaleString()} / 출력 ${usage.outputTokens.toLocaleString()} / 캐시읽기 ${usage.cacheReadTokens.toLocaleString()} / 검색 ${usage.webSearchCount}회 / 약 $${usage.estimatedUsd.toFixed(4)}`;
}
