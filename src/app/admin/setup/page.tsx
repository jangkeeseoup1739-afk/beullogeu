import Link from 'next/link';
import { loadConfig, tokenDaysLeft } from '@/lib/config';
import { getStore } from '@/lib/store';
import { getMe, getPublishingLimit } from '@/lib/threads';
import { errorMessage } from '@/lib/logger';
import { CopyButton, RecheckButton } from './SetupClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 자동 실행(cron)이 동작하려면 코드가 이 브랜치에 있어야 합니다. */
const DEFAULT_BRANCH = 'claude/naver-blog-automation-check-vvq51j';

export default async function SetupPage() {
  const check = loadConfig();
  const store = getStore();

  let storageOk = false;
  let storageError = '';
  try {
    await store.getSettings();
    storageOk = true;
  } catch (error) {
    storageError = errorMessage(error);
  }

  const me = check.canPublish ? await getMe() : null;
  const limit = check.canPublish ? await getPublishingLimit() : null;
  const daysLeft = tokenDaysLeft(check.config.threadsTokenIssuedAt);

  // Vercel이 배포할 때 넣어주는 값입니다. 로컬에서는 비어 있습니다.
  const deployedBranch = process.env.VERCEL_GIT_COMMIT_REF ?? '';
  const repoOwner = process.env.VERCEL_GIT_REPO_OWNER ?? 'jangkeeseoup1739-afk';
  const repoSlug = process.env.VERCEL_GIT_REPO_SLUG ?? 'beullogeu';
  const onVercel = Boolean(process.env.VERCEL);

  const canGenerate = check.canGenerate;
  const blobReady = store.kind === 'blob' && storageOk;
  const threadsReady = Boolean(me);
  const branchReady = !onVercel || deployedBranch === DEFAULT_BRANCH;

  const nextAction = !branchReady
    ? '1단계 — GitHub에서 Merge 버튼을 눌러 코드를 기본 브랜치에 합쳐 주세요.'
    : !canGenerate
      ? '2단계 — Vercel에 ANTHROPIC_API_KEY 를 넣고 재배포해 주세요.'
      : !blobReady
        ? '3단계 — Vercel에서 Blob 스토어를 만들어 주세요.'
        : !threadsReady
          ? '4단계 — Threads 토큰을 발급해 넣으면 자동 게시까지 완성됩니다. (지금은 승인 대기로만 쌓입니다)'
          : '모두 완료됐습니다. 09:00 / 13:00 / 19:00 에 자동으로 글이 올라갑니다.';

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>설정 도우미</h1>
          <p className="muted" style={{ margin: 0 }}>
            아래에서 ❌ 인 항목만 처리하면 됩니다. ✅ 는 이미 끝난 것입니다.
          </p>
        </div>
        <Link className="btn" href="/admin">
          관리자 화면으로
        </Link>
      </header>

      <div className={`notice ${nextAction.startsWith('모두') ? 'ok' : ''}`}>
        <strong>지금 하실 일</strong>
        <br />
        {nextAction}
      </div>

      <div className="card">
        <RecheckButton />
      </div>

      <StepCard
        done={branchReady}
        title="1단계. 코드를 기본 브랜치에 합치기"
        summary={
          onVercel
            ? `지금 배포된 브랜치: ${deployedBranch || '확인 불가'}`
            : '로컬에서 실행 중이라 확인하지 않습니다.'
        }
      >
        <p>
          GitHub Actions의 <b>예약 실행은 저장소의 기본 브랜치에서만 동작합니다.</b> 그래서 코드를
          기본 브랜치(<code>{DEFAULT_BRANCH}</code>)에 합쳐야 하루 3회 자동 실행이 켜집니다.
        </p>
        <ol>
          <li>
            <a
              href={`https://github.com/${repoOwner}/${repoSlug}/pulls`}
              target="_blank"
              rel="noreferrer"
            >
              저장소의 Pull requests 탭
            </a>
            을 엽니다.
          </li>
          <li>올라와 있는 Pull request를 클릭합니다.</li>
          <li>
            초록색 <b>Merge pull request</b> 버튼 → <b>Confirm merge</b> 를 누릅니다.
          </li>
        </ol>
        <p className="muted">
          버튼이 회색이거나 충돌(conflict) 문구가 보이면 그 문장을 그대로 알려주세요. 제가
          해결하겠습니다.
        </p>
      </StepCard>

      <StepCard
        done={canGenerate}
        title="2단계. 글을 만들 수 있게 하기 (Anthropic API 키)"
        summary={canGenerate ? 'API 키가 들어 있습니다.' : 'ANTHROPIC_API_KEY 가 없습니다.'}
      >
        <ol>
          <li>
            <a href="https://vercel.com/new" target="_blank" rel="noreferrer">
              vercel.com/new
            </a>{' '}
            에서 이 저장소를 <b>Import</b> 합니다. (이미 했다면 넘어가세요)
          </li>
          <li>
            Vercel 프로젝트 → <b>Settings</b> → <b>Environment Variables</b> 로 갑니다.
          </li>
          <li>
            아래 두 개를 추가합니다. <span className="muted">(Key 칸에 이름, Value 칸에 값)</span>
          </li>
        </ol>
        <table>
          <thead>
            <tr>
              <th>이름 (Key)</th>
              <th>값 (Value)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>ANTHROPIC_API_KEY</code>
              </td>
              <td className="muted">
                console.anthropic.com → API keys 에서 발급한 <code>sk-ant-</code> 로 시작하는 값
              </td>
              <td>
                <CopyButton value="ANTHROPIC_API_KEY" label="이름 복사" />
              </td>
            </tr>
            <tr>
              <td>
                <code>ADMIN_PASSWORD</code>
              </td>
              <td className="muted">이 화면에 들어올 때 쓸 비밀번호 (직접 정하세요)</td>
              <td>
                <CopyButton value="ADMIN_PASSWORD" label="이름 복사" />
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          입력한 뒤 <b>Deployments</b> 탭 → 맨 위 배포의 <b>⋯</b> → <b>Redeploy</b> 를 눌러야 값이
          적용됩니다.
        </p>
      </StepCard>

      <StepCard
        done={blobReady}
        title="3단계. 기록을 저장할 곳 만들기 (Vercel Blob)"
        summary={
          store.kind === 'blob'
            ? storageOk
              ? 'Blob 스토어가 연결됐습니다.'
              : `Blob 연결 오류: ${storageError}`
            : '아직 Blob 스토어가 없어 로컬 파일에 저장합니다. (Vercel에서는 기록이 사라집니다)'
        }
      >
        <ol>
          <li>
            Vercel 프로젝트 → <b>Storage</b> 탭 → <b>Create Database</b> → <b>Blob</b> 선택
          </li>
          <li>
            이름은 그대로 두고 <b>Create</b> → 이 프로젝트에 <b>Connect</b>
          </li>
          <li>
            연결하면 <code>BLOB_READ_WRITE_TOKEN</code> 이 자동으로 들어갑니다. 직접 입력할 필요가
            없습니다.
          </li>
          <li>
            <b>Deployments → Redeploy</b> 를 한 번 더 눌러 주세요.
          </li>
        </ol>
        <p className="muted">
          무료 용량은 256MB이고 이 시스템은 글 한 건에 2KB 정도만 씁니다. 몇 년을 써도 남습니다.
        </p>
      </StepCard>

      <StepCard
        done={threadsReady}
        title="4단계. Threads에 자동으로 올리기 (나중에 해도 됩니다)"
        summary={
          threadsReady
            ? `연결됨: @${me?.username ?? '확인 불가'}${
                limit ? ` · 오늘 ${limit.quota - limit.used}회 게시 가능` : ''
              }${daysLeft !== null ? ` · 토큰 ${daysLeft}일 남음` : ''}`
            : '아직 연결되지 않았습니다. 이 상태에서도 글은 만들어지고 승인 대기로 쌓입니다.'
        }
      >
        <p>
          <b>이 단계를 하지 않아도 2·3단계까지 하면 글이 만들어지는 것을 확인할 수 있습니다.</b>{' '}
          Threads 연결은 실제로 올리기 시작할 때 하시면 됩니다.
        </p>
        <ol>
          <li>
            <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">
              developers.facebook.com/apps
            </a>{' '}
            → <b>앱 만들기</b>
          </li>
          <li>사용 사례에서 Threads 관련 항목을 고르고 앱을 만듭니다.</li>
          <li>
            앱 화면에서 Threads 계정을 연결하고 <code>threads_basic</code>,{' '}
            <code>threads_content_publish</code> 권한을 추가합니다.
          </li>
          <li>액세스 토큰을 생성해 복사합니다. (긴 문자열)</li>
          <li>
            브라우저 주소창에 아래 주소를 열어 <code>id</code> 값을 확인합니다.
            <br />
            <code>https://graph.threads.net/v1.0/me?fields=id,username&amp;access_token=복사한토큰</code>
          </li>
          <li>
            Vercel 환경 변수에 <code>THREADS_ACCESS_TOKEN</code>(토큰),{' '}
            <code>THREADS_USER_ID</code>(id 숫자)를 넣고 Redeploy 합니다.
          </li>
          <li>
            GitHub 저장소 → <b>Settings → Secrets and variables → Actions</b> 에도 같은 값들을
            등록합니다. (자동 실행은 GitHub에서 돌기 때문입니다)
          </li>
        </ol>
        <p className="muted">
          화면이 설명과 다르게 보이면 보이는 메뉴 이름을 알려주세요. Meta 화면은 계정마다 조금씩
          다릅니다.
        </p>
      </StepCard>

      <StepCard
        done={false}
        title="참고. GitHub Secrets 목록 (4단계에서 함께 등록)"
        summary="자동 실행은 GitHub Actions에서 돌기 때문에 Vercel과 별도로 값이 필요합니다."
        alwaysOpen
      >
        <table>
          <thead>
            <tr>
              <th>이름</th>
              <th>어디서 가져오나</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[
              ['ANTHROPIC_API_KEY', 'Vercel에 넣은 것과 같은 값'],
              ['ADMIN_PASSWORD', 'Vercel에 넣은 것과 같은 값'],
              ['BLOB_READ_WRITE_TOKEN', 'Vercel → Storage → Blob 스토어 → .env.local 탭에서 복사'],
              ['THREADS_ACCESS_TOKEN', '4단계에서 발급한 토큰'],
              ['THREADS_USER_ID', '4단계에서 확인한 id 숫자'],
            ].map(([name, where]) => (
              <tr key={name}>
                <td>
                  <code>{name}</code>
                </td>
                <td className="muted">{where}</td>
                <td>
                  <CopyButton value={name} label="이름 복사" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          등록 후{' '}
          <a
            href={`https://github.com/${repoOwner}/${repoSlug}/actions`}
            target="_blank"
            rel="noreferrer"
          >
            Actions 탭
          </a>{' '}
          → <b>부동산 Threads 자동 게시</b> → <b>Run workflow</b> 로 한 번 시험 실행해 보세요.
        </p>
      </StepCard>
    </div>
  );
}

function StepCard({
  done,
  title,
  summary,
  children,
  alwaysOpen = false,
}: {
  done: boolean;
  title: string;
  summary: string;
  children: React.ReactNode;
  alwaysOpen?: boolean;
}) {
  return (
    <div className="card">
      <div className="row between">
        <strong>
          {alwaysOpen ? '' : done ? '✅ ' : '❌ '}
          {title}
        </strong>
        {!alwaysOpen && <span className={`badge ${done ? 'published' : 'pending_approval'}`}>{done ? '완료' : '남음'}</span>}
      </div>
      <p className="muted" style={{ margin: '4px 0 0' }}>
        {summary}
      </p>
      <details open={!done || alwaysOpen} style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontSize: 14 }}>하는 방법 보기</summary>
        <div style={{ fontSize: 14, marginTop: 6 }}>{children}</div>
      </details>
    </div>
  );
}
