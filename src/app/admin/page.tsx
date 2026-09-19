import Link from 'next/link';
import { loadConfig, tokenDaysLeft } from '@/lib/config';
import { SLOT_LABEL, isSensitive } from '@/lib/categories';
import { DEFAULT_SETTINGS, getStore } from '@/lib/store';
import { dateKeyKst, formatKst } from '@/lib/time';
import { summarizeVerification } from '@/lib/verify';
import type { PostRecord, RunLog, Settings } from '@/lib/types';
import Controls from './Controls';
import PostActions from './PostActions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminPage() {
  const check = loadConfig();
  const store = getStore();

  let posts: PostRecord[] = [];
  let logs: RunLog[] = [];
  let settings: Settings = DEFAULT_SETTINGS;
  let storeError = '';

  try {
    [posts, logs, settings] = await Promise.all([
      store.listPosts(60),
      store.listLogs(12),
      store.getSettings(),
    ]);
  } catch (error) {
    storeError = error instanceof Error ? error.message : String(error);
  }

  const today = dateKeyKst();
  const todayPosts = posts.filter((post) => post.dateKey === today);
  const pending = posts.filter((post) => post.status === 'pending_approval');
  const problems = posts.filter((post) => post.status === 'failed' || post.status === 'held');
  const publishedToday = todayPosts.filter((post) => post.status === 'published').length;
  const monthPrefix = today.slice(0, 7);
  const monthCost = posts
    .filter((post) => post.dateKey.startsWith(monthPrefix))
    .reduce((sum, post) => sum + post.usage.estimatedUsd, 0);
  const daysLeft = tokenDaysLeft(check.config.threadsTokenIssuedAt);

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>부동산 Threads 자동화</h1>
          <p className="muted" style={{ margin: 0 }}>
            오늘 {today} (한국시간) · 하루 3회 09:00 / 13:00 / 19:00 자동 실행
          </p>
        </div>
        <div className="row">
          <Link className="btn" href="/admin/setup">
            설정 도우미
          </Link>
          <a className="btn" href="/api/health" target="_blank" rel="noreferrer">
            연결 점검
          </a>
          <form action="/api/logout" method="post">
            <button type="submit">로그아웃</button>
          </form>
        </div>
      </header>

      {check.missing.length > 0 && (
        <div className="notice error">
          아직 설정이 끝나지 않았습니다. 없는 값: <strong>{check.missing.join(', ')}</strong>
          <br />
          무엇을 어디서 눌러야 하는지 화면으로 안내해 드립니다.
          <div style={{ marginTop: 8 }}>
            <Link className="btn" href="/admin/setup">
              설정 도우미 열기
            </Link>
          </div>
        </div>
      )}

      {store.kind === 'local' && process.env.VERCEL && (
        <div className="notice">
          기록을 임시 저장하고 있습니다. Vercel에서는 배포할 때마다 사라지므로 Blob 스토어를 만들어
          주세요. <Link href="/admin/setup">설정 도우미 3단계</Link>에 방법이 있습니다.
        </div>
      )}

      {storeError && <div className="notice error">저장소를 읽지 못했습니다: {storeError}</div>}

      {daysLeft !== null && daysLeft <= 14 && (
        <div className="notice">
          Threads 액세스 토큰 만료가 {daysLeft}일 남았습니다. 토큰을 갱신해 Vercel과 GitHub
          Secrets에 새 값을 넣어 주세요. (장기 토큰은 60일이며 24시간 경과 후 갱신할 수 있습니다)
        </div>
      )}

      <div className="grid">
        <div className="stat">
          <div className="label">오늘 게시 완료</div>
          <div className="value">{publishedToday} / 3</div>
        </div>
        <div className="stat">
          <div className="label">승인 대기</div>
          <div className="value">{pending.length}건</div>
        </div>
        <div className="stat">
          <div className="label">실패 · 보류</div>
          <div className="value">{problems.length}건</div>
        </div>
        <div className="stat">
          <div className="label">자동화</div>
          <div className="value">{settings.automationEnabled ? 'ON' : 'OFF'}</div>
        </div>
        <div className="stat">
          <div className="label">마지막 실행</div>
          <div className="value" style={{ fontSize: 15 }}>
            {settings.lastRunAt ? formatKst(settings.lastRunAt) : '기록 없음'}
          </div>
          <div className="muted">{settings.lastRunResult ?? ''}</div>
        </div>
        <div className="stat">
          <div className="label">이번 달 추정 비용</div>
          <div className="value">${monthCost.toFixed(2)}</div>
          <div className="muted">저장소: {store.kind === 'blob' ? 'Vercel Blob' : '로컬 파일'}</div>
        </div>
      </div>

      <h2>작업</h2>
      <Controls automationEnabled={settings.automationEnabled} canPublish={check.canPublish} />

      {pending.length > 0 && (
        <>
          <h2>승인 대기 ({pending.length}건)</h2>
          <p className="muted" style={{ marginTop: -4 }}>
            청약·분양·세금·대출·제이원플렉스 카테고리는 숫자와 일정을 직접 확인한 뒤 게시하세요.
          </p>
          {pending.map((post) => (
            <PostCard key={post.id} post={post} canPublish={check.canPublish} />
          ))}
        </>
      )}

      <h2>오늘 만든 글 ({todayPosts.length}건)</h2>
      {todayPosts.length === 0 ? (
        <div className="card muted">아직 오늘 만든 글이 없습니다.</div>
      ) : (
        todayPosts
          .filter((post) => post.status !== 'pending_approval')
          .map((post) => <PostCard key={post.id} post={post} canPublish={check.canPublish} />)
      )}

      <h2>게시 이력</h2>
      {posts.length === 0 ? (
        <div className="card muted">기록이 없습니다.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>시간</th>
              <th>슬롯</th>
              <th>카테고리</th>
              <th>상태</th>
              <th>첫 문장</th>
              <th>출처</th>
            </tr>
          </thead>
          <tbody>
            {posts.slice(0, 25).map((post) => (
              <tr key={post.id}>
                <td>{formatKst(post.createdAt)}</td>
                <td>{SLOT_LABEL[post.slot].slice(0, 5)}</td>
                <td>
                  {post.category}
                  {isSensitive(post.category) && <span className="muted"> (승인)</span>}
                </td>
                <td>
                  <span className={`badge ${post.status}`}>{statusLabel(post.status)}</span>
                </td>
                <td>
                  {post.threads?.permalink ? (
                    <a href={post.threads.permalink} target="_blank" rel="noreferrer">
                      {post.hook}
                    </a>
                  ) : (
                    post.hook
                  )}
                </td>
                <td className="muted">
                  {post.sources.length > 0 ? post.sources[0].publisher : '-'}
                  {post.sources.length > 1 ? ` +${post.sources.length - 1}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>최근 실행 기록</h2>
      {logs.length === 0 ? (
        <div className="card muted">실행 기록이 없습니다.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>시작</th>
              <th>슬롯</th>
              <th>방식</th>
              <th>결과</th>
              <th>단계</th>
              <th>비용</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{formatKst(log.startedAt)}</td>
                <td>{log.slot}</td>
                <td>{log.trigger === 'cron' ? '자동' : '수동'}</td>
                <td>
                  <span className={`badge ${log.result}`}>{log.result}</span>
                  {log.error && <div className="muted">{log.error}</div>}
                </td>
                <td className="muted">
                  {log.stages.map((stage) => `${stage.ok ? '✓' : '✗'} ${stage.name}`).join(' · ')}
                </td>
                <td className="muted">${log.usage.estimatedUsd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>참고</h2>
      <div className="card muted">
        <p style={{ marginTop: 0 }}>
          · 이미 Threads에 게시된 글은 이 화면에서 삭제할 수 없습니다. Threads 앱에서 직접
          삭제하세요. (Threads API가 게시물 삭제를 제공하지 않습니다)
        </p>
        <p>· &quot;게시 중지&quot;는 아직 올라가지 않은 글의 게시를 취소합니다.</p>
        <p style={{ marginBottom: 0 }}>
          · 자동화를 끄면 09:00 / 13:00 / 19:00 자동 실행이 글을 만들지 않고 건너뜁니다.
        </p>
      </div>
    </div>
  );
}

function statusLabel(status: PostRecord['status']): string {
  switch (status) {
    case 'published':
      return '게시 완료';
    case 'pending_approval':
      return '승인 대기';
    case 'failed':
      return '게시 실패';
    case 'held':
      return '보류';
    case 'cancelled':
      return '취소';
    default:
      return status;
  }
}

function PostCard({ post, canPublish }: { post: PostRecord; canPublish: boolean }) {
  return (
    <div className="card">
      <div className="row between">
        <div className="row">
          <span className="badge">{post.category}</span>
          <span className={`badge ${post.status}`}>{statusLabel(post.status)}</span>
          <span className="muted">
            {formatKst(post.createdAt)} · {post.text.length}자 · {SLOT_LABEL[post.slot]}
          </span>
        </div>
        <span className="muted">${post.usage.estimatedUsd.toFixed(4)}</span>
      </div>

      <p className="post-text">{post.text}</p>

      {post.sources.length > 0 && (
        <ul className="sources">
          {post.sources.map((source) => (
            <li key={source.url}>
              {source.publisher} —{' '}
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title || source.url}
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="muted" style={{ marginBottom: 4 }}>
        검증: {summarizeVerification(post.verification)} · 중복 검사: 최대 유사도{' '}
        {post.dedupe.maxSimilarity} ({post.dedupe.comparedCount}건 비교)
      </p>

      {post.verification.unsupportedSentences.length > 0 && (
        <div className="notice error">
          근거를 찾지 못한 문장: {post.verification.unsupportedSentences.join(' / ')}
        </div>
      )}
      {post.error && (
        <div className="notice error">
          {post.error.stage} 단계 오류: {post.error.message}
        </div>
      )}
      {post.threads?.permalink && (
        <p className="muted" style={{ marginBottom: 4 }}>
          <a href={post.threads.permalink} target="_blank" rel="noreferrer">
            Threads에서 보기
          </a>
        </p>
      )}

      <PostActions
        postId={post.id}
        status={post.status}
        canPublish={canPublish}
        verified={post.verification.passed}
      />
    </div>
  );
}
