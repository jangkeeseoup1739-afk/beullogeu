/**
 * 화면 확인용 샘플 글 3건을 저장합니다. API 키가 없어도 실행됩니다.
 *
 *   npx tsx scripts/seed-sample.ts          샘플 3건 저장
 *   npx tsx scripts/seed-sample.ts --clear  샘플만 삭제 (실제 글은 건드리지 않음)
 *
 * 샘플은 제목 앞에 [샘플] 이 붙고 검증을 통과하지 않은 상태로 저장되므로
 * 실수로 Threads에 게시되지 않습니다.
 */
import { loadEnvFile } from './env';

loadEnvFile();

const SAMPLE_PREFIX = 'sample-';

async function main(): Promise<void> {
  const { getStore } = await import('../src/lib/store');
  const { dateKeyKst } = await import('../src/lib/time');
  const { emptyUsage } = await import('../src/lib/usage');

  const store = getStore();
  const clear = process.argv.includes('--clear');

  if (clear) {
    const posts = await store.listPosts(200);
    const samples = posts.filter((post) => post.id.startsWith(SAMPLE_PREFIX));
    for (const post of samples) {
      await store.deletePost(post.id);
      console.log(`삭제: ${post.id}`);
    }
    console.log(samples.length === 0 ? '지울 샘플이 없습니다.' : `샘플 ${samples.length}건을 지웠습니다.`);
    return;
  }

  const today = dateKeyKst();
  const usage = emptyUsage();

  const samples = [
    {
      slot: 'morning' as const,
      category: 'NEWS' as const,
      hook: '[샘플] 공급이 늘어난다는 뉴스만 보면 좋은 건지 헷갈립니다.',
      text: `[샘플] 공급이 늘어난다는 뉴스만 보면 좋은 건지 헷갈립니다.
실제로 같이 봐야 하는 건 공급량 하나가 아니라 기존 입주물량, 미분양, 주변 전세가입니다.
입주물량이 겹치는 시기에는 전세가부터 먼저 움직이는 경우가 많습니다.
관심 지역이 있다면 입주 예정 시기와 미분양 추이를 함께 확인해 보시는 게 좋습니다.`,
      topicKey: 'NEWS|전국|공급',
      keywords: ['공급', '입주물량', '미분양', '전세가'],
      sources: [
        {
          title: '주택 공급 통계',
          url: 'https://www.molit.go.kr',
          publisher: '국토교통부',
        },
      ],
      needsApproval: false,
    },
    {
      slot: 'noon' as const,
      category: '청약' as const,
      hook: '[샘플] 청약은 분양가만 보고 판단하면 놓치는 게 있습니다.',
      text: `[샘플] 청약은 분양가만 보고 판단하면 놓치는 게 있습니다.
모집공고에는 전매제한과 거주의무 기간이 함께 적혀 있습니다.
같은 지역이라도 단지마다 조건이 다르기 때문에 공고문이 기준이 됩니다.
특별공급과 일반공급 신청일이 다르니 일정도 따로 확인해야 합니다.
청약홈 공고문을 먼저 열어보시길 권합니다.`,
      topicKey: '청약|전국|모집공고',
      keywords: ['청약', '전매제한', '거주의무', '모집공고'],
      sources: [
        {
          title: '입주자모집공고',
          url: 'https://www.applyhome.co.kr',
          publisher: '청약홈',
        },
      ],
      needsApproval: true,
    },
    {
      slot: 'evening' as const,
      category: '부동산상식' as const,
      hook: '[샘플] 전세가율이 높아졌다는 말만 듣고 안심하면 위험합니다.',
      text: `[샘플] 전세가율이 높아졌다는 말만 듣고 안심하면 위험합니다.
전세가율은 매매가 대비 전세가 비율인데, 매매가가 내려가면 비율은 저절로 올라갑니다.
숫자가 올랐다는 사실만으로 시장이 좋아졌다고 보기는 어렵습니다.
등기부등본에서 근저당 금액을 확인하고, 보증금과 합친 금액이 집값에 비해 어느 정도인지 직접 계산해 보세요.`,
      topicKey: '부동산상식|전국|전세가율',
      keywords: ['전세가율', '등기부등본', '근저당'],
      sources: [],
      needsApproval: false,
    },
  ];

  let index = 0;
  for (const sample of samples) {
    index += 1;
    const post = {
      id: `${SAMPLE_PREFIX}${today}-${index}`,
      createdAt: new Date().toISOString(),
      dateKey: today,
      slot: sample.slot,
      category: sample.category,
      text: sample.text,
      hook: sample.hook,
      topicKey: sample.topicKey,
      keywords: sample.keywords,
      sources: sample.sources,
      status: 'pending_approval' as const,
      needsApproval: sample.needsApproval,
      verification: {
        // 샘플은 일부러 검증 미통과로 둡니다. 그래야 "즉시 게시" 버튼이 나타나지 않습니다.
        passed: false,
        ruleIssues: [],
        unsupportedSentences: [],
        politicalIssues: [],
        confidence: 0,
        notes: '화면 확인용 샘플이라 실제 게시는 되지 않습니다.',
      },
      dedupe: { isDuplicate: false, comparedCount: 0, maxSimilarity: 0, attempts: 0 },
      usage,
      model: 'sample',
    };
    await store.savePost(post);
    console.log(`저장: ${post.id} [${post.category}] ${post.text.length}자`);
  }

  console.log('');
  console.log(`샘플 ${samples.length}건을 저장했습니다. (${store.kind === 'blob' ? 'Vercel Blob' : '로컬 data/ 폴더'})`);
  console.log('관리자 화면 /admin 에서 확인하세요.');
  console.log('지울 때: npx tsx scripts/seed-sample.ts --clear');
}

main().catch((error) => {
  console.error('샘플 저장 실패:', error);
  process.exitCode = 1;
});
