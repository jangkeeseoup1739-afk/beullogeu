/**
 * 전체 파이프라인.
 *
 *   조사 → 카테고리 선택 → 작성 → 규칙 검사 → 중복 검사 → 사실 대조 → 게시 → 기록
 *
 * 설계 원칙 ([15] 오류 처리):
 *   각 단계는 실패해도 예외를 위로 던지지 않습니다. 실패를 기록하고 가능한 만큼 진행한 뒤,
 *   게시할 수 없으면 보류(held)나 실패(failed) 상태로 저장합니다. 다음 실행은 항상 정상 진행됩니다.
 */
import { candidatesFor, isSensitive } from './categories';
import { loadConfig } from './config';
import { checkDuplicate } from './dedupe';
import { RunLogger, errorMessage } from './logger';
import { getResearchForSlot, pickItemsForCategory } from './research';
import { nextCandidate, selectCategory } from './schedule';
import { DEFAULT_SETTINGS, getStore, newPostId } from './store';
import { publishText } from './threads';
import { dateKeyKst } from './time';
import { addUsage, emptyUsage } from './usage';
import { checkFacts, checkRules, summarizeVerification } from './verify';
import { writeDraft, writeFallbackDraft, type Draft } from './writer';
import type {
  Category,
  PostRecord,
  ResearchItem,
  ResearchResult,
  RunLog,
  Slot,
  SourceRef,
  UsageRecord,
} from './types';

const MAX_WRITE_ATTEMPTS = 3;

export interface RunOptions {
  slot: Slot;
  trigger: 'cron' | 'manual';
  /** true 면 Threads에 올리지 않고 결과만 만듭니다. */
  dryRun?: boolean;
  /** 카테고리를 직접 지정합니다. (관리자 화면에서 특정 주제를 요청할 때) */
  forceCategory?: Category;
}

export interface RunResult {
  post: PostRecord | null;
  log: RunLog;
  message: string;
}

export async function runSlot(options: RunOptions): Promise<RunResult> {
  const logger = new RunLogger(options.slot, options.trigger);
  const store = getStore();
  const today = dateKeyKst();
  const { canGenerate, canPublish, config } = loadConfig();

  if (!canGenerate) {
    logger.stage('환경변수 확인', false, 'ANTHROPIC_API_KEY 없음');
    logger.setResult('skipped', undefined, 'ANTHROPIC_API_KEY 가 없어 콘텐츠를 만들 수 없습니다.');
    return { post: null, log: await logger.save(), message: 'ANTHROPIC_API_KEY 가 없습니다.' };
  }

  // 자동화 스위치 확인 (자동 실행일 때만 적용. 수동 실행은 관리자가 직접 누른 것이므로 통과)
  let settings = DEFAULT_SETTINGS;
  try {
    settings = await store.getSettings();
  } catch (error) {
    logger.stage('설정 읽기', false, errorMessage(error));
  }
  if (options.trigger === 'cron' && !settings.automationEnabled) {
    logger.stage('자동화 상태 확인', true, '자동화가 꺼져 있어 실행하지 않습니다.');
    logger.setResult('skipped', undefined, '자동화 OFF');
    return { post: null, log: await logger.save(), message: '자동화가 꺼져 있습니다.' };
  }
  logger.stage('설정 확인', true, `자동화 ${settings.automationEnabled ? 'ON' : 'OFF'}`);

  // 최근 기록 (중복 검사와 비율 계산에 사용)
  let recentPosts: PostRecord[] = [];
  try {
    recentPosts = await store.listPosts(60);
    logger.stage('기존 기록 읽기', true, `${recentPosts.length}건`);
  } catch (error) {
    logger.stage('기존 기록 읽기', false, errorMessage(error));
  }

  // 이번 실행에서 쓸 후보 카테고리 (하루 1회면 전 카테고리를 대상으로 합니다)
  const candidates = candidatesFor(options.slot, config.postsPerDay);

  // 1) 조사
  let research: ResearchResult = {
    dateKey: today,
    createdAt: new Date().toISOString(),
    items: [],
    ok: false,
    notes: '',
    usage: emptyUsage(),
  };
  try {
    research = await getResearchForSlot(options.slot, candidates, today);
    logger.addUsage(research.usage);
    logger.stage(
      '뉴스·자료 조사',
      research.ok,
      research.ok ? `${research.items.length}개 항목` : research.notes,
    );
  } catch (error) {
    logger.stage('뉴스·자료 조사', false, errorMessage(error));
  }

  // 2) 카테고리 선택
  const choice = selectCategory(candidates, recentPosts, research, today);
  let category: Category = options.forceCategory ?? choice.category;
  logger.stage(
    '카테고리 선택',
    true,
    options.forceCategory ? `${category} (직접 지정)` : choice.reason,
  );

  // 3) 작성 → 검사 → 필요하면 재작성
  const triedCategories: Category[] = [category];
  let usage: UsageRecord = emptyUsage();
  let draft: Draft | null = null;
  let sources: SourceRef[] = [];
  let items: ResearchItem[] = [];
  let ruleIssues: string[] = [];
  let dedupe = checkDuplicate(
    { text: '', hook: '', topicKey: '', keywords: [], sourceUrls: [], category },
    [],
  );
  let verification = {
    passed: false,
    ruleIssues: [] as string[],
    unsupportedSentences: [] as string[],
    politicalIssues: [] as string[],
    confidence: 0,
    notes: '아직 검증하지 않았습니다.',
  };
  let rewriteReason: string | undefined;
  let previousText: string | undefined;

  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
    items = research.ok ? pickItemsForCategory(research, category, 4) : [];

    const written =
      research.ok && items.length > 0
        ? await writeDraft({
            dateKey: today,
            slot: options.slot,
            category,
            items,
            recentPosts,
            rewriteReason,
            previousText,
          })
        : await writeFallbackDraft(today, options.slot, recentPosts);

    usage = addUsage(usage, written.usage);
    logger.addUsage(written.usage);

    if (!written.draft) {
      logger.stage(`콘텐츠 생성 (${attempt}차)`, false, written.error ?? '생성 실패');
      rewriteReason = '이전 생성이 실패했습니다.';
      continue;
    }

    draft = written.draft;
    sources = written.sources;
    category = draft.category;
    logger.stage(`콘텐츠 생성 (${attempt}차)`, true, `${draft.text.length}자 / ${category}`);

    // 3-1) 규칙 검사
    ruleIssues = checkRules({
      text: draft.text,
      hook: draft.hook,
      category,
      sourceCount: sources.length,
    });
    if (ruleIssues.length > 0) {
      logger.stage(`규칙 검사 (${attempt}차)`, false, ruleIssues.join(' / '));
      rewriteReason = `규칙 위반: ${ruleIssues.join(' / ')}`;
      previousText = draft.text;
      continue;
    }
    logger.stage(`규칙 검사 (${attempt}차)`, true);

    // 3-2) 중복 검사
    dedupe = checkDuplicate(
      {
        text: draft.text,
        hook: draft.hook,
        topicKey: draft.topicKey,
        keywords: draft.keywords,
        sourceUrls: sources.map((s) => s.url),
        category,
      },
      recentPosts,
      attempt - 1,
      today,
    );
    if (dedupe.isDuplicate) {
      logger.stage(`중복 검사 (${attempt}차)`, false, dedupe.reason);
      rewriteReason = `중복입니다: ${dedupe.reason} 완전히 새로운 관점과 소재로 써주세요.`;
      previousText = draft.text;
      // 마지막 시도 전에는 카테고리를 바꿔 새 소재를 찾습니다.
      if (attempt === MAX_WRITE_ATTEMPTS - 1) {
        const alternative = nextCandidate(choice, triedCategories);
        if (alternative) {
          category = alternative;
          triedCategories.push(alternative);
          rewriteReason += ` 카테고리를 ${alternative} 로 바꿔 주세요.`;
        }
      }
      continue;
    }
    logger.stage(`중복 검사 (${attempt}차)`, true, `최대 유사도 ${dedupe.maxSimilarity}`);

    // 3-3) 사실 대조 검증
    const factCheck = await checkFacts(draft.text, items, category, ruleIssues);
    usage = addUsage(usage, factCheck.usage);
    logger.addUsage(factCheck.usage);
    verification = factCheck.verification;

    if (!verification.passed) {
      logger.stage(`사실 검증 (${attempt}차)`, false, summarizeVerification(verification));
      rewriteReason = [
        verification.unsupportedSentences.length
          ? `조사 자료에 근거가 없는 문장: ${verification.unsupportedSentences.join(' / ')}`
          : '',
        verification.politicalIssues.length
          ? `정치적 표현: ${verification.politicalIssues.join(' / ')}`
          : '',
      ]
        .filter(Boolean)
        .join(' | ');
      previousText = draft.text;
      continue;
    }

    logger.stage(`사실 검증 (${attempt}차)`, true, summarizeVerification(verification));
    break;
  }

  if (!draft) {
    logger.setResult('failed', undefined, '콘텐츠를 만들지 못했습니다.');
    return {
      post: null,
      log: await logger.save(),
      message: '콘텐츠 생성에 실패했습니다. 로그를 확인하세요.',
    };
  }

  // 4) 기록 만들기
  const needsApproval = isSensitive(category);
  const post: PostRecord = {
    id: newPostId(options.slot),
    createdAt: new Date().toISOString(),
    dateKey: today,
    slot: options.slot,
    category,
    text: draft.text.trim(),
    hook: draft.hook.trim(),
    topicKey: draft.topicKey,
    keywords: draft.keywords,
    sources,
    status: 'held',
    needsApproval,
    verification,
    dedupe,
    usage,
    model: 'claude-opus-5',
  };

  // 5) 게시 여부 판단
  const blocked = !verification.passed || dedupe.isDuplicate;
  if (blocked) {
    post.status = 'held';
    post.error = {
      stage: 'verify',
      message: dedupe.isDuplicate
        ? (dedupe.reason ?? '중복')
        : summarizeVerification(verification),
      at: new Date().toISOString(),
    };
    logger.setResult('held', post.id, post.error.message);
  } else if (options.dryRun) {
    post.status = 'pending_approval';
    logger.stage('게시', true, '테스트 실행이라 게시하지 않았습니다.');
    logger.setResult('pending_approval', post.id);
  } else if (needsApproval || !config.autoPublish || !canPublish) {
    post.status = 'pending_approval';
    const reason = !canPublish
      ? 'Threads 토큰이 없어 승인 대기로 저장합니다.'
      : needsApproval
        ? `${category} 는 승인이 필요한 카테고리입니다.`
        : '자동 게시가 꺼져 있습니다.';
    logger.stage('게시 보류', true, reason);
    logger.setResult('pending_approval', post.id, reason);
  } else {
    try {
      const published = await publishText(post.text);
      post.status = 'published';
      post.threads = published;
      logger.stage('Threads 게시', true, published.postId);
      logger.setResult('published', post.id);
    } catch (error) {
      post.status = 'failed';
      post.error = { stage: 'publish', message: errorMessage(error), at: new Date().toISOString() };
      logger.stage('Threads 게시', false, errorMessage(error));
      logger.setResult('failed', post.id, errorMessage(error));
    }
  }

  // 6) 저장
  try {
    await store.savePost(post);
    logger.stage('기록 저장', true, post.id);
  } catch (error) {
    logger.stage('기록 저장', false, errorMessage(error));
  }

  try {
    await store.saveSettings({
      ...settings,
      lastRunAt: new Date().toISOString(),
      lastRunResult: `${options.slot} / ${post.status}`,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.stage('설정 저장', false, errorMessage(error));
  }

  const log = await logger.save();
  return { post, log, message: describeStatus(post) };
}

function describeStatus(post: PostRecord): string {
  switch (post.status) {
    case 'published':
      return `게시 완료 (${post.category})`;
    case 'pending_approval':
      return `승인 대기 (${post.category})`;
    case 'held':
      return `보류 — ${post.error?.message ?? '검증 미통과'}`;
    case 'failed':
      return `게시 실패 — ${post.error?.message ?? '원인 불명'}`;
    default:
      return post.status;
  }
}

/**
 * 승인 대기 또는 실패한 글을 지금 게시합니다. (관리자 화면의 "즉시 게시" 버튼)
 * 검증을 통과하지 못한 글은 게시하지 않습니다.
 */
export async function publishExistingPost(
  id: string,
): Promise<{ ok: boolean; post: PostRecord | null; message: string }> {
  const store = getStore();
  const post = await store.getPost(id);
  if (!post) return { ok: false, post: null, message: '게시물을 찾을 수 없습니다.' };

  if (post.status === 'published') {
    return { ok: false, post, message: '이미 게시된 글입니다.' };
  }
  if (post.status === 'cancelled') {
    return { ok: false, post, message: '취소된 글입니다.' };
  }
  if (!post.verification.passed) {
    return {
      ok: false,
      post,
      message: `검증을 통과하지 못한 글은 게시할 수 없습니다. (${summarizeVerification(post.verification)})`,
    };
  }

  try {
    const published = await publishText(post.text);
    post.status = 'published';
    post.threads = published;
    post.error = undefined;
    await store.savePost(post);
    return { ok: true, post, message: '게시했습니다.' };
  } catch (error) {
    post.status = 'failed';
    post.error = { stage: 'publish', message: errorMessage(error), at: new Date().toISOString() };
    await store.savePost(post);
    return { ok: false, post, message: `게시 실패: ${errorMessage(error)}` };
  }
}

/** 대기 중인 글의 게시를 취소합니다. (이미 게시된 글은 Threads 앱에서 직접 삭제해야 합니다) */
export async function cancelPost(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  const store = getStore();
  const post = await store.getPost(id);
  if (!post) return { ok: false, message: '게시물을 찾을 수 없습니다.' };
  if (post.status === 'published') {
    return {
      ok: false,
      message: '이미 게시된 글은 여기서 취소할 수 없습니다. Threads 앱에서 삭제하세요.',
    };
  }
  post.status = 'cancelled';
  await store.savePost(post);
  return { ok: true, message: '게시를 취소했습니다.' };
}
