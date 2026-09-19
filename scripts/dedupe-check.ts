/**
 * 중복 검사 동작 확인용 스크립트. API 키가 없어도 실행됩니다.
 *   npx tsx scripts/dedupe-check.ts
 */
import { checkDuplicate, textSimilarity } from '../src/lib/dedupe';
import type { PostRecord } from '../src/lib/types';
import { dateKeyKst } from '../src/lib/time';

function samplePost(overrides: Partial<PostRecord>): PostRecord {
  return {
    id: 'sample',
    createdAt: new Date().toISOString(),
    dateKey: dateKeyKst(),
    slot: 'morning',
    category: 'NEWS',
    text: '',
    hook: '',
    topicKey: '',
    keywords: [],
    sources: [],
    status: 'published',
    needsApproval: false,
    verification: {
      passed: true,
      ruleIssues: [],
      unsupportedSentences: [],
      politicalIssues: [],
      confidence: 1,
      notes: '',
    },
    dedupe: { isDuplicate: false, comparedCount: 0, maxSimilarity: 0, attempts: 0 },
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      webSearchCount: 0,
      estimatedUsd: 0,
    },
    model: 'test',
    ...overrides,
  };
}

const pairs: [string, string, string][] = [
  [
    '거의 같은 글',
    '오늘 서울 아파트 거래량이 늘었습니다. 다만 지역별로 차이가 큽니다. 계약 전에 실거래가를 확인하는 것이 좋습니다.',
    '오늘 서울 아파트 거래량이 증가했습니다. 다만 지역별 차이가 큽니다. 계약 전 실거래가를 확인하는 것이 좋습니다.',
  ],
  [
    '같은 주제 다른 관점',
    '오늘 서울 아파트 거래량이 늘었습니다. 다만 지역별로 차이가 큽니다. 계약 전에 실거래가를 확인하는 것이 좋습니다.',
    '입주물량이 늘어나는 지역은 전세가부터 움직입니다. 공급 숫자만 보지 말고 미분양과 함께 봐야 합니다. 기준 시점을 꼭 확인하세요.',
  ],
  [
    '완전히 다른 글',
    '청약 넣기 전에 모집공고의 거주의무와 전매제한을 먼저 확인하세요.',
    '지식산업센터를 볼 때는 층별 하중과 물류 동선을 먼저 확인하는 것이 좋습니다.',
  ],
];

console.log('문장 유사도 (기준: 0.55 이상이면 중복)');
for (const [label, a, b] of pairs) {
  console.log(`  ${label}: ${textSimilarity(a, b).toFixed(3)}`);
}

console.log('\n중복 판정 시나리오');

const history: PostRecord[] = [
  samplePost({
    id: 'p1',
    text: pairs[0][1],
    hook: '오늘 서울 아파트 거래량이 늘었습니다.',
    topicKey: 'NEWS|서울|거래량',
    keywords: ['서울', '아파트', '거래량'],
    sources: [{ title: '기사', url: 'https://example.com/a', publisher: 'example.com' }],
  }),
];

const cases: { label: string; candidate: Parameters<typeof checkDuplicate>[0] }[] = [
  {
    label: '같은 본문 재작성',
    candidate: {
      text: pairs[0][2],
      hook: '오늘 서울 아파트 거래량이 증가했습니다.',
      topicKey: 'NEWS|서울|거래건수',
      keywords: ['서울', '매매'],
      sourceUrls: [],
      category: 'NEWS',
    },
  },
  {
    label: '같은 주제키',
    candidate: {
      text: '전혀 다른 문장으로 썼습니다. 그렇지만 주제키가 같습니다. 확인이 필요합니다.',
      hook: '전혀 다른 문장으로 썼습니다.',
      topicKey: 'NEWS|서울|거래량',
      keywords: ['서울'],
      sourceUrls: [],
      category: 'NEWS',
    },
  },
  {
    label: '같은 출처 재사용',
    candidate: {
      text: '다른 내용을 담은 글입니다. 출처만 같습니다. 기준 시점을 확인하세요.',
      hook: '다른 내용을 담은 글입니다.',
      topicKey: 'NEWS|경기|입주물량',
      keywords: ['경기'],
      sourceUrls: ['https://example.com/a'],
      category: 'NEWS',
    },
  },
  {
    label: '완전히 새로운 글',
    candidate: {
      text: '청약 넣기 전에 모집공고의 거주의무와 전매제한을 먼저 확인하세요. 조건은 단지마다 다릅니다. 공고문이 기준입니다.',
      hook: '청약 넣기 전에 확인할 것이 있습니다.',
      topicKey: '청약|전국|거주의무',
      keywords: ['청약', '거주의무'],
      sourceUrls: ['https://applyhome.co.kr/x'],
      category: '청약',
    },
  },
];

for (const testCase of cases) {
  const result = checkDuplicate(testCase.candidate, history);
  const mark = result.isDuplicate ? '중복' : '통과';
  console.log(`  [${mark}] ${testCase.label} — ${result.reason ?? `최대 유사도 ${result.maxSimilarity}`}`);
}
