# realestate-threads-auto

대한민국 부동산 전반의 정보를 다루는 **Threads 전문 채널 자동화 시스템**입니다.

Claude가 매일 최신 부동산 자료를 조사하고, Threads에 맞는 글을 쓰고, 사실관계와 중복을 검사한 뒤
자동으로 게시합니다. **기본값은 하루 1회(한국시간 09:00)** 이며, 모든 카테고리를 목표 비율대로
돌아가며 씁니다. 하루 3회로 늘리려면 워크플로의 cron 두 줄 주석을 풀고 `POSTS_PER_DAY` 를 3 으로 바꾸면 됩니다.

> **처음 설정하신다면 [설정하기.md](설정하기.md) 를 보세요.** 버튼 이름만 따라가면 되는 4단계 문서입니다.
> 이 README는 구조와 규칙을 설명하는 개발자용 문서입니다.
> 배포한 뒤에는 `내주소/admin/setup` 화면이 지금 무엇이 남았는지 ✅/❌ 로 알려줍니다.

```
최신 부동산 자료 조사 (웹 검색)
   ↓
카테고리 자동 선택 (목표 비율 + 중요 뉴스 우선)
   ↓
Threads용 콘텐츠 작성
   ↓
규칙 검사 → 중복 검사 → 사실 대조 검증
   ↓
Threads API 게시 (민감 카테고리는 승인 후 게시)
   ↓
게시 기록 저장 → 관리자 화면에서 확인
```

---

## 1. 구성

| 역할 | 어디서 도는가 | 설명 |
| --- | --- | --- |
| 자동 실행(시계) + 파이프라인 | **GitHub Actions** | 매일 정해진 시간에 실행. 조사·작성·검증·게시를 모두 처리합니다 |
| 관리자 화면 + 버튼 동작 | **Vercel (Next.js)** | 기록 확인, 승인 게시, 즉시 게시, 자동화 ON/OFF |
| 데이터 저장 | **저장소 또는 Vercel Blob** | 게시물 1건 = JSON 파일 1개. 토큰은 저장하지 않습니다 |

> **왜 Vercel Cron이 아닌가요?** Vercel 무료(Hobby) 플랜의 Cron은 **하루 1회, 프로젝트당 2개**까지만
> 허용되고 실행 시각도 정확하지 않습니다. 나중에 횟수를 늘릴 여지까지 생각하면 GitHub Actions가 확실합니다.
> 또 Vercel 무료 플랜 함수는 최대 300초라 조사가 길어지면 끊길 수 있는데,
> GitHub Actions 런너에는 그 제한이 없습니다.
> (Vercel Pro를 쓰신다면 `vercel.json`에 `crons`를 추가해 대체할 수 있습니다.
> 외부 크론 서비스를 쓰고 싶다면 `POST /api/cron/run?slot=morning` 을 호출하면 됩니다.)

### 파일 구조

```
src/lib/
  config.ts      환경 변수 로딩·검증, 모델과 단가 설정
  types.ts       공통 타입 (게시 기록이 중심 데이터)
  time.ts        한국시간 계산
  categories.ts  카테고리 18종, 목표 비율, 슬롯별 후보, 승인 필요 카테고리
  sources.ts     신뢰 출처 도메인 목록, 출처 기관 이름 추정
  jwonplex.ts    제이원플렉스 확정 사실 화이트리스트
  store.ts       저장소 (Vercel Blob / 로컬 파일 자동 전환)
                 — Blob 토큰이 없으면 data/ 에 쓰고, 워크플로가 이를 저장소에 커밋해 보존합니다
  logger.ts      실행 로그
  usage.ts       토큰 사용량과 비용 추정
  claude.ts      Anthropic API 공통 처리 (웹 검색, pause_turn 재개)
  research.ts    1단계 조사
  writer.ts      2단계 작성
  verify.ts      3단계 검증 (규칙 + 사실 대조)
  dedupe.ts      중복 검사 (한글 3-gram 유사도)
  schedule.ts    카테고리 자동 선택
  threads.ts     Threads API 게시
  pipeline.ts    전체 흐름 조립
  auth.ts        관리자 로그인
src/app/
  admin/         관리자 화면
  admin/setup/   설정 도우미 (남은 설정을 ✅/❌ 로 안내)
  login/         로그인 화면
  api/           generate · posts · publish · cancel · settings · health · cron/run
scripts/
  run-slot.ts      자동 실행 진입점 (GitHub Actions와 로컬 공용)
  dedupe-check.ts  중복 검사 동작 확인
  seed-sample.ts   화면 확인용 샘플 글 3건 생성/삭제 (API 키 불필요)
.github/workflows/threads-auto.yml   매일 자동 실행 (기본 하루 1회)
```

---

## 2. 환경 변수

`.env.example` 을 참고하세요. **값은 코드에 직접 넣지 않습니다.**

| 이름 | 필수 | 어디에 넣나 | 설명 |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | ✅ | Vercel + GitHub Secrets | 조사·작성·검증에 사용 |
| `THREADS_ACCESS_TOKEN` | ✅ | Vercel + GitHub Secrets | Threads 장기 토큰 (60일) |
| `THREADS_USER_ID` | ✅ | Vercel + GitHub Secrets | Threads 사용자 ID (숫자) |
| `ADMIN_PASSWORD` | ✅ | Vercel + GitHub Secrets | 관리자 화면 로그인 |
| `BLOB_READ_WRITE_TOKEN` | ✅ | Vercel 자동 + GitHub Secrets | Blob 스토어를 만들면 Vercel이 자동 생성 |
| `CRON_SECRET` | 선택 | Vercel | 외부 크론으로 `/api/cron/run` 을 쓸 때만 필요 |
| `APP_BASE_URL` | 선택 | — | 배포 주소 |
| `THREADS_TOKEN_ISSUED_AT` | 선택 | Vercel | `YYYY-MM-DD`. 넣으면 만료 D-14 경고 표시 |
| `AUTO_PUBLISH` | 선택 | Vercel + GitHub Variables | `false` 로 두면 모든 글이 승인 대기 |
| `POSTS_PER_DAY` | 선택 | GitHub Variables | 하루 게시 횟수 (기본 1). 1이면 전 카테고리를 한 번의 실행에서 비율대로 순환 |

---

## 3. 설치와 배포 순서

> 아래는 전체 절차 요약입니다. 처음이라면 [설정하기.md](설정하기.md) 가 더 쉽습니다.
> **GitHub Actions 예약 실행은 저장소 기본 브랜치에서만 동작합니다.** 코드를 기본 브랜치로 합쳐야
> 자동 실행이 켜집니다.

### ① Threads 토큰 발급 (직접)

1. <https://developers.facebook.com/apps> → **앱 만들기**
2. 사용 사례에서 **Threads API** 선택 → 앱 이름 입력 → 생성
3. 앱 대시보드 → **Threads API 설정(Threads API → 설정)**
4. **Threads 계정 연결** 후 권한에서 `threads_basic`, `threads_content_publish` 추가
5. **액세스 토큰 생성** → 나온 토큰을 복사 (단기 토큰이면 장기 토큰으로 교환)
6. 사용자 ID 확인:
   ```
   https://graph.threads.net/v1.0/me?fields=id,username&access_token=복사한토큰
   ```
   응답의 `id` 가 `THREADS_USER_ID` 입니다.

### ② Vercel 배포 (직접)

1. <https://vercel.com/new> → 이 GitHub 저장소 **Import**
2. Framework 가 **Next.js** 로 잡히는지 확인 → **Deploy**
3. 배포 후 프로젝트 → **Settings → Environment Variables** 에서 위 표의 값 입력
4. **Storage → Create Database → Blob** 으로 Blob 스토어 생성
   (`BLOB_READ_WRITE_TOKEN` 이 자동으로 추가됩니다)
5. 다시 **Deployments → Redeploy** 로 환경 변수를 적용

### ③ GitHub Secrets 등록 (직접)

저장소 → **Settings → Secrets and variables → Actions → New repository secret**

- `ANTHROPIC_API_KEY`
- `THREADS_ACCESS_TOKEN`
- `THREADS_USER_ID`
- `BLOB_READ_WRITE_TOKEN` (Vercel Blob 스토어 화면에서 복사)
- `ADMIN_PASSWORD`

### ④ 첫 실행 확인

저장소 → **Actions → 부동산 Threads 자동 게시 → Run workflow**
→ `slot = morning`, `dry_run = true` 로 실행해 글이 만들어지는지 먼저 확인하세요.
잘 나오면 `dry_run = false` 로 실제 게시를 시험합니다.

---

## 4. 로컬에서 테스트

```bash
npm install
cp .env.example .env.local     # 값 채우기 (최소 ANTHROPIC_API_KEY)

# 조사 → 작성 → 검증 → 중복검사까지 실행하고 게시는 하지 않음
npx tsx scripts/run-slot.ts --slot=morning --dry-run

# 중복 검사 동작만 확인 (API 키 불필요)
npx tsx scripts/dedupe-check.ts

# 화면 확인용 샘플 글 3건 넣기 / 지우기 (API 키 불필요)
npx tsx scripts/seed-sample.ts
npx tsx scripts/seed-sample.ts --clear

# 관리자 화면 (http://localhost:3000/admin)
npm run dev
```

`BLOB_READ_WRITE_TOKEN` 이 없으면 `data/` 폴더에 파일로 저장합니다. (로컬에서는 `.gitignore` 처리됨)

**기록 보존 방식** — Vercel Blob 을 연결하지 않아도 기록이 사라지지 않습니다.
GitHub Actions 러너는 실행이 끝나면 사라지기 때문에, 워크플로가 매 실행마다
`data/posts/` 와 `logs/` 를 저장소에 커밋합니다. 다음 실행은 checkout 으로 그 기록을 그대로
받아 중복 검사와 카테고리 비율 순환에 사용합니다.
Blob 을 연결하면 그쪽이 우선이 되고 `data/` 는 더 이상 쓰이지 않습니다.

---

## 5. 콘텐츠 규칙

### 카테고리 비율 ([src/lib/categories.ts](src/lib/categories.ts))

| 묶음 | 목표 | 포함 카테고리 |
| --- | --- | --- |
| 부동산뉴스 | 25% | NEWS |
| 청약분양 | 20% | 청약, 분양 |
| 부동산정책 | 15% | 정책, 재개발, 재건축 |
| 시장·가격·거래 | 10% | 시장분석, 전세, 월세, 지역정보 |
| 대출·금융·세금 | 10% | 대출, 세금 |
| 아파트·오피스텔 | 10% | 아파트, 오피스텔 |
| 수익형부동산 | 5% | 상가, 지식산업센터 |
| 제이원플렉스 | 5% | 제이원플렉스 (최소 7일 간격) |

최근 40건 기록에서 목표보다 부족한 묶음을 먼저 고르고, 중요도 4 이상의 뉴스가 있으면
그 카테고리를 우선합니다. **하루 1회 모드에서는 슬롯 구분 없이 모든 카테고리가 후보**가 되어
위 비율이 그대로 지켜집니다. 하루 3회 모드에서는 시간대별 역할([9])에 따라 후보가 나뉩니다. 조사가 실패하면 숫자에 의존하지 않는 **부동산상식** 글로 대체합니다.

### 승인이 필요한 카테고리

`청약`, `분양`, `세금`, `대출`, `제이원플렉스` 는 자동 게시하지 않고 **승인 대기**로 저장됩니다.
관리자 화면에서 숫자와 일정을 확인한 뒤 **즉시 게시** 를 누르면 올라갑니다.
목록은 `src/lib/categories.ts` 의 `SENSITIVE_CATEGORIES` 에서 바꿀 수 있습니다.

### 중복 검사 기준 ([src/lib/dedupe.ts](src/lib/dedupe.ts))

- 본문 유사도 0.55 이상 (최근 30일)
- 첫 문장 유사도 0.60 이상
- 같은 주제키 (최근 7일)
- 같은 출처 URL 재사용 (최근 14일)
- 같은 카테고리에서 키워드 80% 이상 겹침 (최근 14일)

걸리면 새로운 관점으로 다시 쓰고, 그래도 걸리면 카테고리를 바꿉니다. (최대 3회)

### 검증 ([src/lib/verify.ts](src/lib/verify.ts))

- **규칙 검사**: 500자 제한, 3~10문장, 해시태그·링크 금지, 금지 표현, 정치적 표현, 출처 유무
- **사실 대조**: 본문의 숫자·일정·제도 내용이 조사 자료에 실제로 있는지 문장 단위로 확인

통과하지 못하면 게시하지 않고 **보류(held)** 로 남깁니다.

### 제이원플렉스 ([src/lib/jwonplex.ts](src/lib/jwonplex.ts))

확정 사실만 사용합니다. 정확한 거리, 분양가, 대출, 세금, 계약조건, 잔여호실은
파일의 `UNVERIFIED_FIELDS` 가 비어 있는 동안 **절대 글에 쓰지 않습니다.**
정확한 자료를 받으면 그 값을 채우세요. 값이 있을 때만 사용됩니다.

---

## 6. 비용

| 항목 | 요금 |
| --- | --- |
| Claude (Opus 5) | 입력 $5 / 출력 $25 per 1M 토큰 |
| 웹 검색 | 1,000회당 $10 |
| GitHub Actions | 월 2,000분 무료 (이 작업은 월 200분 내외) |
| Vercel Hobby + Blob | 무료 (Blob 256MB, 이 용량으로 충분) |

**실측 기준(2026-09-19 첫 실행): 1건에 $0.58** (웹 검색 8회, 조사 2분 40초 포함).
하루 1회면 **월 $17 안팎**, 하루 3회면 **월 $33~42** 수준입니다.
(처음 예상했던 월 $10~20 은 과소 추정이었습니다. 실측으로 정정합니다.)
실제 사용량은 게시 기록과 실행 로그에 저장되며 관리자 화면 상단에서 이번 달 누적을 볼 수 있습니다.

비용을 더 줄이려면 `src/lib/config.ts` 의 `MODEL.verifier` 를 `claude-sonnet-5` 로 바꾸거나,
`src/lib/research.ts` 의 `effort` 를 `medium` 으로 낮추세요.

---

## 7. 지원하지 않는 것 (정직하게)

- **이미 게시된 글의 삭제·수정**: Threads API가 제공하지 않습니다. Threads 앱에서 직접 하세요.
- **토큰 자동 갱신 후 자동 반영**: 코드가 환경 변수를 바꿀 수는 없습니다.
  만료 14일 전부터 관리자 화면에 경고가 뜨며, 갱신한 값은 직접 Vercel과 GitHub Secrets에 넣어야 합니다.
- **예약 시간 정밀도**: GitHub Actions 예약은 부하에 따라 수 분 늦어질 수 있습니다.

---

## 8. 문제가 생겼을 때

| 증상 | 확인할 곳 |
| --- | --- |
| 글이 안 올라간다 | Actions 실행 로그 → 관리자 화면의 실행 기록 → `/api/health` |
| 승인 대기만 쌓인다 | 민감 카테고리이거나 `AUTO_PUBLISH=false` 이거나 Threads 토큰이 없는 경우 |
| 보류(held)가 많다 | 검증에서 걸린 문장이 관리자 화면에 표시됩니다 |
| 게시 실패 | 토큰 만료(60일), 24시간 250건 한도, 500자 초과 |
| 예약이 멈췄다 | 공개 저장소는 60일간 커밋이 없으면 자동 중지됩니다(워크플로가 매 실행마다 기록을 커밋해 방지) |

---

## 9. 앞으로 확장할 부분

`src/lib/ingest/` 폴더가 확장 지점입니다. 네이버 블로그, 유튜브, 인스타그램 콘텐츠를
같은 파이프라인(조사 → 작성 → 검증 → 게시)에 연결할 수 있게 구조를 비워 두었습니다.
