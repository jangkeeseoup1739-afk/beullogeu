'use client';

import { useState } from 'react';

export default function PostActions({
  postId,
  status,
  canPublish,
  verified,
}: {
  postId: string;
  status: string;
  canPublish: boolean;
  verified: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function call(action: 'publish' | 'cancel') {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/posts/${postId}/${action}`, { method: 'POST' });
      const data = (await response.json()) as { ok: boolean; message: string };
      setMessage(data.message);
      if (data.ok) window.location.reload();
    } catch {
      setMessage('요청이 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const publishable =
    (status === 'pending_approval' || status === 'failed') && canPublish && verified;

  return (
    <div>
      <div className="row">
        {publishable && (
          <button className="primary" onClick={() => call('publish')} disabled={busy}>
            {busy ? '게시 중…' : '즉시 게시'}
          </button>
        )}
        {status !== 'published' && status !== 'cancelled' && (
          <button className="danger" onClick={() => call('cancel')} disabled={busy}>
            게시 중지
          </button>
        )}
      </div>
      {message && (
        <div className="notice" style={{ marginTop: 8 }}>
          {message}
        </div>
      )}
    </div>
  );
}
