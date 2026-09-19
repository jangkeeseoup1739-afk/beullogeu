/**
 * 저장소 어댑터.
 *
 * - Vercel Blob (BLOB_READ_WRITE_TOKEN 이 있을 때): 운영 환경
 * - 로컬 파일 (토큰이 없을 때): data/ 폴더. 설정 없이 바로 테스트할 수 있습니다.
 *
 * 설계 메모: 게시물 1건을 파일 1개로 저장합니다. 하나의 큰 목록 파일을 고쳐 쓰지 않으므로
 * GitHub Actions 실행과 관리자 화면 조작이 동시에 일어나도 서로 덮어쓰지 않습니다.
 *
 * 보안: Blob 파일은 URL을 아는 사람이면 볼 수 있습니다. 따라서 API 키나 액세스 토큰은
 * 절대 저장하지 않습니다. 게시물 본문과 출처, 실행 로그만 저장합니다.
 */
import { loadConfig } from './config';
import { dateKeyKst } from './time';
import type { PostRecord, ResearchResult, RunLog, Settings } from './types';

const POSTS_PREFIX = 'posts/';
const LOGS_PREFIX = 'logs/';
const RESEARCH_PREFIX = 'research/';
const SETTINGS_PATH = 'settings.json';

export interface Store {
  kind: 'blob' | 'local';
  savePost(post: PostRecord): Promise<void>;
  getPost(id: string): Promise<PostRecord | null>;
  listPosts(limit?: number): Promise<PostRecord[]>;
  /** 기록 삭제. 샘플 데이터를 지울 때만 씁니다. 관리자 화면에는 노출하지 않습니다. */
  deletePost(id: string): Promise<void>;
  saveResearch(research: ResearchResult): Promise<void>;
  getResearch(dateKey: string): Promise<ResearchResult | null>;
  saveLog(log: RunLog): Promise<void>;
  listLogs(limit?: number): Promise<RunLog[]>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
}

export const DEFAULT_SETTINGS: Settings = {
  automationEnabled: true,
  updatedAt: new Date(0).toISOString(),
};

function postPath(id: string): string {
  return `${POSTS_PREFIX}${id}.json`;
}

/** 최신순 정렬. id가 날짜로 시작하므로 문자열 역순이 곧 최신순입니다. */
function newestFirst(a: string, b: string): number {
  return b.localeCompare(a);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ───────────────────────────── Vercel Blob ─────────────────────────────

function createBlobStore(token: string): Store {
  // CDN 캐시 때문에 방금 저장한 내용이 예전 값으로 읽히는 것을 막기 위해
  // 저장은 캐시 60초(최소값), 읽기는 캐시 무효화 쿼리 + no-store 로 처리합니다.
  async function writeJson(pathname: string, value: unknown): Promise<void> {
    const { put } = await import('@vercel/blob');
    await put(pathname, JSON.stringify(value, null, 2), {
      access: 'public',
      token,
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
  }

  async function readJson<T>(pathname: string): Promise<T | null> {
    const { list } = await import('@vercel/blob');
    const found = await list({ token, prefix: pathname, limit: 1 });
    const blob = found.blobs.find((b) => b.pathname === pathname);
    if (!blob) return null;
    const response = await fetch(`${blob.url}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  }

  async function readManyByPrefix<T>(prefix: string, limit: number): Promise<T[]> {
    const { list } = await import('@vercel/blob');
    const found = await list({ token, prefix, limit: 1000 });
    const paths = found.blobs
      .map((b) => b.pathname)
      .sort(newestFirst)
      .slice(0, limit);
    const byPath = new Map(found.blobs.map((b) => [b.pathname, b.url]));
    const values = await mapWithConcurrency(paths, 8, async (pathname) => {
      try {
        const url = byPath.get(pathname);
        if (!url) return null;
        const response = await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return null;
        return (await response.json()) as T;
      } catch {
        return null;
      }
    });
    return values.filter((v): v is T => v !== null);
  }

  async function remove(pathname: string): Promise<void> {
    const { del } = await import('@vercel/blob');
    await del(pathname, { token });
  }

  return {
    kind: 'blob',
    savePost: (post) => writeJson(postPath(post.id), post),
    getPost: (id) => readJson<PostRecord>(postPath(id)),
    listPosts: (limit = 60) => readManyByPrefix<PostRecord>(POSTS_PREFIX, limit),
    deletePost: (id) => remove(postPath(id)),
    saveResearch: (research) => writeJson(`${RESEARCH_PREFIX}${research.dateKey}.json`, research),
    getResearch: (dateKey) => readJson<ResearchResult>(`${RESEARCH_PREFIX}${dateKey}.json`),
    saveLog: (log) => writeJson(`${LOGS_PREFIX}${log.id}.json`, log),
    listLogs: (limit = 30) => readManyByPrefix<RunLog>(LOGS_PREFIX, limit),
    async getSettings() {
      return (await readJson<Settings>(SETTINGS_PATH)) ?? DEFAULT_SETTINGS;
    },
    saveSettings: (settings) => writeJson(SETTINGS_PATH, settings),
  };
}

// ───────────────────────────── 로컬 파일 ─────────────────────────────

function createLocalStore(): Store {
  const root = 'data';

  async function fs() {
    return await import('node:fs/promises');
  }

  async function writeJson(pathname: string, value: unknown): Promise<void> {
    const f = await fs();
    const path = await import('node:path');
    const full = path.join(root, pathname);
    await f.mkdir(path.dirname(full), { recursive: true });
    await f.writeFile(full, JSON.stringify(value, null, 2), 'utf8');
  }

  async function readJson<T>(pathname: string): Promise<T | null> {
    try {
      const f = await fs();
      const path = await import('node:path');
      const raw = await f.readFile(path.join(root, pathname), 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async function readManyByPrefix<T>(prefix: string, limit: number): Promise<T[]> {
    try {
      const f = await fs();
      const path = await import('node:path');
      const dir = path.join(root, prefix);
      const names = (await f.readdir(dir)).filter((n) => n.endsWith('.json')).sort(newestFirst);
      const out: T[] = [];
      for (const name of names.slice(0, limit)) {
        const value = await readJson<T>(`${prefix}${name}`);
        if (value) out.push(value);
      }
      return out;
    } catch {
      return [];
    }
  }

  async function remove(pathname: string): Promise<void> {
    try {
      const f = await fs();
      const path = await import('node:path');
      await f.unlink(path.join(root, pathname));
    } catch {
      // 없는 파일을 지우는 것은 오류로 보지 않습니다.
    }
  }

  return {
    kind: 'local',
    savePost: (post) => writeJson(postPath(post.id), post),
    getPost: (id) => readJson<PostRecord>(postPath(id)),
    listPosts: (limit = 60) => readManyByPrefix<PostRecord>(POSTS_PREFIX, limit),
    deletePost: (id) => remove(postPath(id)),
    saveResearch: (research) => writeJson(`${RESEARCH_PREFIX}${research.dateKey}.json`, research),
    getResearch: (dateKey) => readJson<ResearchResult>(`${RESEARCH_PREFIX}${dateKey}.json`),
    saveLog: (log) => writeJson(`${LOGS_PREFIX}${log.id}.json`, log),
    listLogs: (limit = 30) => readManyByPrefix<RunLog>(LOGS_PREFIX, limit),
    async getSettings() {
      return (await readJson<Settings>(SETTINGS_PATH)) ?? DEFAULT_SETTINGS;
    },
    saveSettings: (settings) => writeJson(SETTINGS_PATH, settings),
  };
}

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  const { config } = loadConfig();
  cached = config.blobToken ? createBlobStore(config.blobToken) : createLocalStore();
  return cached;
}

/** 새 게시물 id. 날짜로 시작하므로 정렬만으로 최신순이 됩니다. */
export function newPostId(slot: string, date: Date = new Date()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${dateKeyKst(date)}-${slot}-${random}`;
}
