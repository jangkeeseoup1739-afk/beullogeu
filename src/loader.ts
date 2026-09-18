import matter from 'gray-matter';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Post } from './types.js';

/**
 * 마크다운을 스마트에디터에 넣을 평문으로 바꿉니다.
 *
 * 굵게/기울임 같은 서식을 실제로 입히려면 에디터 툴바를 일일이 조작해야 하는데,
 * 그 방식은 셀렉터가 조금만 바뀌어도 글이 깨진 채 발행됩니다.
 * 서식 기호를 정리한 평문을 넣는 쪽이 결과가 예측 가능합니다.
 * 강조가 필요하면 발행 후 에디터에서 직접 입히는 편이 빠릅니다.
 */
export function markdownToPlainText(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let inCodeFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue; // 코드 펜스 기호만 버리고 안의 내용은 그대로 둡니다
    }
    if (inCodeFence) {
      out.push(line);
      continue;
    }

    let text = line;
    text = text.replace(/^\s{0,3}#{1,6}\s+/, '');            // 제목 기호
    text = text.replace(/^\s{0,3}>\s?/, '');                 // 인용 기호
    text = text.replace(/^(\s*)[-*+]\s+/, '$1• ');           // 글머리 기호
    text = text.replace(/^\s{0,3}([-*_]\s*){3,}$/, '');      // 구분선
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1');  // 이미지는 대체텍스트만
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)'); // 링크
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');           // 굵게
    text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');  // 기울임
    text = text.replace(/`([^`]+)`/g, '$1');                 // 인라인 코드
    out.push(text);
  }

  // 빈 줄이 3개 이상 이어지면 2개로 줄입니다
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim().replace(/^#/, '')).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);
  }
  return [];
}

/** 마크다운 파일 하나를 읽어 Post 로 만듭니다. */
export function loadPost(path: string): Post {
  const sourcePath = resolve(path);
  const raw = readFileSync(sourcePath, 'utf8');
  const { data, content } = matter(raw);

  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (!title) {
    throw new Error(
      `제목이 없습니다: ${sourcePath}\n` +
        '  파일 맨 위 프론트매터에 title 을 넣어주세요:\n' +
        '    ---\n    title: 글 제목\n    ---',
    );
  }

  const body = markdownToPlainText(content);
  if (!body) {
    throw new Error(`본문이 비어 있습니다: ${sourcePath}`);
  }

  const tags = parseTags(data.tags);
  if (tags.length > 30) {
    throw new Error(
      `태그가 ${tags.length}개입니다. 네이버 블로그는 글당 최대 30개까지 허용합니다.`,
    );
  }

  const category =
    typeof data.category === 'string' && data.category.trim()
      ? data.category.trim()
      : undefined;

  return { sourcePath, title, body, tags, category };
}
