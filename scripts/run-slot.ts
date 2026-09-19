/**
 * 자동 실행 진입점. GitHub Actions와 로컬 테스트에서 같은 코드를 씁니다.
 *
 * 사용법:
 *   npx tsx scripts/run-slot.ts --slot=morning --dry-run   (게시하지 않고 결과만 확인)
 *   npx tsx scripts/run-slot.ts --slot=noon                (실제 게시)
 *   npx tsx scripts/run-slot.ts                            (현재 한국시간에 맞는 슬롯)
 *
 * 옵션:
 *   --slot=morning|noon|evening
 *   --dry-run            Threads에 올리지 않습니다
 *   --category=청약       카테고리를 직접 지정합니다
 *   --trigger=cron|manual
 */
import { loadEnvFile } from './env';

loadEnvFile();

async function main(): Promise<void> {
  // 환경 변수를 먼저 읽은 다음 모듈을 불러옵니다.
  const { runSlot } = await import('../src/lib/pipeline');
  const { currentSlot } = await import('../src/lib/time');
  const { isCategory } = await import('../src/lib/categories');
  const { formatUsage } = await import('../src/lib/usage');
  const { SLOT_LABEL } = await import('../src/lib/categories');
  const { loadConfig } = await import('../src/lib/config');

  const args = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const found = args.find((arg) => arg.startsWith(`--${name}=`));
    return found ? found.slice(name.length + 3) : undefined;
  };
  const has = (name: string): boolean => args.includes(`--${name}`);

  const slotArg = get('slot');
  const slot =
    slotArg === 'morning' || slotArg === 'noon' || slotArg === 'evening' ? slotArg : currentSlot();
  const dryRun = has('dry-run');
  const triggerArg = get('trigger');
  const trigger = triggerArg === 'manual' ? 'manual' : 'cron';
  const categoryArg = get('category');
  const forceCategory = categoryArg && isCategory(categoryArg) ? categoryArg : undefined;

  const check = loadConfig();
  console.log('─'.repeat(60));
  console.log(`실행 슬롯 : ${slot} (${SLOT_LABEL[slot]})`);
  console.log(`실행 방식 : ${trigger}${dryRun ? ' / 게시 안 함(dry-run)' : ''}`);
  console.log(`저장소    : ${check.storage === 'blob' ? 'Vercel Blob' : '로컬 data/ 폴더'}`);
  if (check.missing.length > 0) {
    console.log(`빠진 환경변수: ${check.missing.join(', ')}`);
  }
  if (forceCategory) console.log(`카테고리  : ${forceCategory} (직접 지정)`);
  console.log('─'.repeat(60));

  const result = await runSlot({ slot, trigger, dryRun, forceCategory });

  console.log('─'.repeat(60));
  console.log(`결과: ${result.message}`);
  if (result.post) {
    console.log(`카테고리: ${result.post.category} / 상태: ${result.post.status}`);
    console.log(`글자수: ${result.post.text.length}자`);
    console.log('');
    console.log(result.post.text);
    console.log('');
    if (result.post.sources.length > 0) {
      console.log('출처:');
      for (const source of result.post.sources) {
        console.log(`  - ${source.publisher}: ${source.url}`);
      }
    }
    if (result.post.verification.ruleIssues.length > 0) {
      console.log('규칙 문제:', result.post.verification.ruleIssues.join(' / '));
    }
    if (result.post.verification.unsupportedSentences.length > 0) {
      console.log('근거 없는 문장:', result.post.verification.unsupportedSentences.join(' / '));
    }
  }
  console.log(`사용량: ${formatUsage(result.log.usage)}`);
  console.log('─'.repeat(60));

  // 게시나 승인 대기까지 정상 진행된 경우만 성공으로 봅니다.
  const ok = result.log.result === 'published' || result.log.result === 'pending_approval';
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error('실행 중 예상하지 못한 오류:', error);
  process.exitCode = 1;
});
