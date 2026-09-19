/**
 * 실행 로그. ([15] 오류 처리 — 오류 내용을 기록하고 다음 실행에 영향을 주지 않는다)
 * 단계별 소요 시간과 성공 여부를 남겨 두면 문제가 생긴 지점을 바로 찾을 수 있습니다.
 */
import { getStore } from './store';
import { dateKeyKst } from './time';
import { addUsage, emptyUsage } from './usage';
import type { RunLog, Slot, UsageRecord } from './types';

export class RunLogger {
  private readonly log: RunLog;
  private stageStart: number;

  constructor(slot: Slot, trigger: 'cron' | 'manual') {
    const now = new Date();
    this.log = {
      id: `${dateKeyKst(now)}-${slot}-${now.getTime()}`,
      dateKey: dateKeyKst(now),
      slot,
      startedAt: now.toISOString(),
      finishedAt: '',
      stages: [],
      result: 'skipped',
      usage: emptyUsage(),
      trigger,
    };
    this.stageStart = Date.now();
  }

  /** 단계 완료를 기록합니다. 실패해도 예외를 던지지 않고 기록만 남깁니다. */
  stage(name: string, ok: boolean, message?: string): void {
    const ms = Date.now() - this.stageStart;
    this.stageStart = Date.now();
    this.log.stages.push({ name, ok, ms, message });
    const mark = ok ? '✓' : '✗';
    console.log(`[${mark}] ${name} (${ms}ms)${message ? ` — ${message}` : ''}`);
  }

  addUsage(usage: UsageRecord): void {
    this.log.usage = addUsage(this.log.usage, usage);
  }

  setResult(result: RunLog['result'], postId?: string, error?: string): void {
    this.log.result = result;
    if (postId) this.log.postId = postId;
    if (error) this.log.error = error;
  }

  get current(): RunLog {
    return this.log;
  }

  /** 저장 실패가 전체 실행을 망치지 않도록 여기서도 예외를 삼킵니다. */
  async save(): Promise<RunLog> {
    this.log.finishedAt = new Date().toISOString();
    try {
      await getStore().saveLog(this.log);
    } catch (error) {
      console.error('실행 로그 저장 실패:', errorMessage(error));
    }
    return this.log;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
