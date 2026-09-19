# 확장 지점 (아직 구현하지 않음)

[17] 확장 기능을 붙일 자리입니다. 어댑터가 아래 형태로 `SourceItem[]` 을 돌려주면
기존 파이프라인(작성 → 검증 → 중복검사 → 게시)을 그대로 재사용할 수 있습니다.

```ts
// src/lib/ingest/types.ts 로 만들 예정
export interface SourceItem {
  origin: 'naver-blog' | 'youtube' | 'instagram' | 'rss';
  title: string;
  body: string;
  url: string;
  publishedAt?: string;
}

export interface IngestAdapter {
  name: string;
  fetchRecent(limit: number): Promise<SourceItem[]>;
}
```

붙이는 순서
1. 어댑터 파일 작성 (`naver.ts`, `youtube.ts`, `instagram.ts`, `rss.ts`)
2. `SourceItem[]` 을 `ResearchItem[]` 으로 변환 (`research.ts` 의 구조화 단계 재사용)
3. `pipeline.ts` 의 조사 단계에서 웹 검색 결과와 합치기

지금은 파일을 만들지 않았습니다. 실제로 쓸 계정과 자료 형식이 정해진 뒤에 추가하는 것이 안전합니다.
