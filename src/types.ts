/** 발행할 글 한 건. 마크다운 파일 하나가 Post 하나가 됩니다. */
export interface Post {
  /** 원본 파일 경로 — 오류 메시지에 씁니다 */
  sourcePath: string;
  title: string;
  /** 에디터에 입력할 본문. 줄 단위로 나뉜 평문입니다 */
  body: string;
  tags: string[];
  /** 블로그 카테고리 이름. 비우면 블로그 기본 카테고리로 발행됩니다 */
  category?: string;
}
