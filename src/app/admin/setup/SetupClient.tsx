'use client';

import { useState } from 'react';

/** 환경 변수 이름처럼 옮겨 적기 번거로운 값을 한 번에 복사합니다. */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button onClick={copy} style={{ fontSize: 13, padding: '4px 9px' }}>
      {copied ? '복사됨' : (label ?? '복사')}
    </button>
  );
}

interface HealthResponse {
  ok: boolean;
  env: { missing: string[]; canGenerate: boolean; canPublish: boolean; autoPublish: boolean };
  storage: { kind: string; ok: boolean; error?: string };
  threads: {
    connected: boolean;
    username: string | null;
    publishingLimit: { used: number; quota: number } | null;
    tokenDaysLeft: number | null;
  };
}

/** 지금 상태를 다시 확인합니다. 환경 변수를 넣고 재배포한 뒤 누르면 됩니다. */
export function RecheckButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<HealthResponse | null>(null);
  const [error, setError] = useState('');

  async function check() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      setResult((await response.json()) as HealthResponse);
    } catch {
      setError('상태를 확인하지 못했습니다. 잠시 후 다시 눌러보세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row">
        <button className="primary" onClick={check} disabled={busy}>
          {busy ? '확인 중…' : '지금 상태 다시 확인'}
        </button>
        <span className="muted">환경 변수를 넣고 재배포한 다음 눌러보세요.</span>
      </div>

      {error && (
        <div className="notice error" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}

      {result && (
        <div className={`notice ${result.ok ? 'ok' : ''}`} style={{ marginTop: 10 }}>
          <div>글 생성 준비: {result.env.canGenerate ? '✅ 완료' : '❌ ANTHROPIC_API_KEY 필요'}</div>
          <div>
            기록 저장: {result.storage.ok ? '✅ 정상' : '❌ 오류'} (
            {result.storage.kind === 'blob' ? 'Vercel Blob' : '로컬 파일'})
          </div>
          <div>
            Threads 게시:{' '}
            {result.threads.connected
              ? `✅ 연결됨 (@${result.threads.username ?? '확인 불가'})`
              : '❌ 아직 연결되지 않음'}
          </div>
          {result.threads.publishingLimit && (
            <div className="muted">
              오늘 게시 가능 횟수: {result.threads.publishingLimit.quota - result.threads.publishingLimit.used}
              회 남음
            </div>
          )}
          {result.env.missing.length > 0 && (
            <div className="muted">아직 없는 값: {result.env.missing.join(', ')}</div>
          )}
          <div className="muted" style={{ marginTop: 6 }}>
            화면을 새로 고치면 아래 단계 표시도 함께 갱신됩니다.
          </div>
        </div>
      )}
    </div>
  );
}
