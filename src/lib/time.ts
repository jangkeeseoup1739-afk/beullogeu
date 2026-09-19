/**
 * 한국시간(KST, UTC+9) 기준 시간 계산.
 * 한국은 서머타임이 없어 UTC+9 고정으로 계산해도 안전합니다.
 * 서버(Vercel, GitHub Actions)는 UTC로 동작하므로 모든 날짜 계산을 여기서 처리합니다.
 */
import type { Slot } from './types';
import { SLOT_HOUR_KST } from './categories';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 한국시간 기준 Date 객체 (UTC 필드에 KST 값이 들어 있는 형태) */
function toKst(date: Date = new Date()): Date {
  return new Date(date.getTime() + KST_OFFSET_MS);
}

/** 한국 날짜 YYYY-MM-DD */
export function dateKeyKst(date: Date = new Date()): string {
  return toKst(date).toISOString().slice(0, 10);
}

/** 한국시간 시각 (0~23) */
export function hourKst(date: Date = new Date()): number {
  return toKst(date).getUTCHours();
}

/** 한국시간 문자열 (2026-09-19 09:03) */
export function formatKst(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '-';
  const kst = toKst(date);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

/** 며칠 전 날짜 키 */
export function dateKeyDaysAgo(days: number, from: Date = new Date()): string {
  return dateKeyKst(new Date(from.getTime() - days * 24 * 60 * 60 * 1000));
}

/** 두 날짜 키 사이의 일수 차이 */
export function daysBetween(dateKeyA: string, dateKeyB: string): number {
  const a = new Date(`${dateKeyA}T00:00:00Z`).getTime();
  const b = new Date(`${dateKeyB}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.round((a - b) / (24 * 60 * 60 * 1000)));
}

/** 현재 한국시간에 가장 가까운 슬롯. 자동 실행에서 슬롯을 명시하지 않았을 때 씁니다. */
export function currentSlot(date: Date = new Date()): Slot {
  const hour = hourKst(date);
  const entries = Object.entries(SLOT_HOUR_KST) as [Slot, number][];
  let best: Slot = 'morning';
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const [slot, slotHour] of entries) {
    const diff = Math.abs(hour - slotHour);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = slot;
    }
  }
  return best;
}
