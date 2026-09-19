'use client';

import { useState } from 'react';
import { ALL_CATEGORIES, SLOT_LABEL } from '@/lib/categories';
import type { Category, PostRecord, Slot } from '@/lib/types';

const SLOTS: Slot[] = ['morning', 'noon', 'evening'];

export default function Controls({
  automationEnabled,
  canPublish,
}: {
  automationEnabled: boolean;
  canPublish: boolean;
}) {
  const [slot, setSlot] = useState<Slot>('morning');
  const [category, setCategory] = useState<'' | Category>('');
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<PostRecord | null>(null);
  const [automation, setAutomation] = useState(automationEnabled);

  async function generate() {
    setBusy(true);
    setMessage('조사와 작성에 1~3분 정도 걸립니다. 창을 닫지 마세요.');
    setPreview(null);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, category: category || undefined, dryRun }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        message: string;
        post: PostRecord | null;
      };
      setMessage(data.message);
      setPreview(data.post);
    } catch {
      setMessage('생성 요청이 실패했습니다. 잠시 후 다시 시도하세요.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleAutomation() {
    const next = !automation;
    setBusy(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automationEnabled: next }),
      });
      const data = (await response.json()) as { ok: boolean };
      if (data.ok) {
        setAutomation(next);
        setMessage(next ? '자동화를 켰습니다.' : '자동화를 껐습니다. 예약 실행이 건너뜁니다.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="row between">
        <strong>새 글 만들기</strong>
        <button onClick={toggleAutomation} disabled={busy} className={automation ? '' : 'danger'}>
          자동화 {automation ? 'ON → 끄기' : 'OFF → 켜기'}
        </button>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <select value={slot} onChange={(event) => setSlot(event.target.value as Slot)}>
          {SLOTS.map((value) => (
            <option key={value} value={value}>
              {SLOT_LABEL[value]}
            </option>
          ))}
        </select>

        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as '' | Category)}
        >
          <option value="">카테고리 자동 선택</option>
          {ALL_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <label className="row" style={{ gap: 4 }}>
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(event) => setDryRun(event.target.checked)}
          />
          <span className="muted">미리보기만 (게시하지 않음)</span>
        </label>

        <button className="primary" onClick={generate} disabled={busy}>
          {busy ? '작업 중…' : dryRun ? '미리보기 생성' : '생성 후 게시'}
        </button>
      </div>

      {!canPublish && (
        <div className="notice" style={{ marginTop: 10 }}>
          Threads 토큰이 없어 실제 게시는 되지 않습니다. 생성된 글은 승인 대기로 저장됩니다.
        </div>
      )}

      {message && (
        <div className="notice ok" style={{ marginTop: 10 }}>
          {message}
        </div>
      )}

      {preview && (
        <div className="card" style={{ marginTop: 10, marginBottom: 0 }}>
          <div className="row">
            <span className="badge">{preview.category}</span>
            <span className={`badge ${preview.status}`}>{preview.status}</span>
            <span className="muted">{preview.text.length}자</span>
          </div>
          <p className="post-text">{preview.text}</p>
          {preview.sources.length > 0 && (
            <ul className="sources">
              {preview.sources.map((source) => (
                <li key={source.url}>
                  {source.publisher} — {source.url}
                </li>
              ))}
            </ul>
          )}
          <p className="muted" style={{ marginBottom: 0 }}>
            새로고침하면 목록에 반영됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
