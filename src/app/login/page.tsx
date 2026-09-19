'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json()) as { ok: boolean; message?: string };
      if (data.ok) {
        window.location.href = '/admin';
        return;
      }
      setError(data.message ?? '로그인에 실패했습니다.');
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <form className="card login-box" onSubmit={submit}>
        <h1>관리자 로그인</h1>
        <p className="muted">ADMIN_PASSWORD 환경 변수에 설정한 비밀번호를 입력하세요.</p>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="비밀번호"
          style={{ width: '100%', marginTop: 8 }}
          autoFocus
        />
        {error && (
          <div className="notice error" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}
        <button type="submit" className="primary" style={{ marginTop: 12, width: '100%' }} disabled={busy}>
          {busy ? '확인 중…' : '로그인'}
        </button>
      </form>
    </div>
  );
}
