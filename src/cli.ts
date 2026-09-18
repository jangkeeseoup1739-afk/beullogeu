import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { runLogin } from './login.js';
import { loadPost } from './loader.js';
import { publishPost, type PublishMode } from './publish.js';

const USAGE = `
네이버 블로그 자동 발행 도구

  npm run login
      브라우저를 띄워 네이버에 직접 로그인합니다. 최초 1회만 하면 됩니다.

  npm run publish -- <글.md> [옵션]
      글을 발행합니다.

      --dry-run    발행 직전까지만 진행하고 스크린샷을 남깁니다.
                   셀렉터가 맞는지 확인할 때 먼저 써보세요.
      --draft      발행하지 않고 임시저장만 합니다.
      --headless   브라우저 창을 띄우지 않습니다.
      --yes        발행 전 확인 질문을 건너뜁니다.

예시:
  npm run publish -- posts/example.md --dry-run
  npm run publish -- posts/example.md --draft
  npm run publish -- posts/example.md
`;

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`${question} (y/N) `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function runPublish(args: string[]): Promise<void> {
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const files = args.filter((a) => !a.startsWith('--'));

  if (files.length === 0) {
    throw new Error('발행할 마크다운 파일을 지정해주세요.\n  예: npm run publish -- posts/example.md');
  }
  if (files.length > 1) {
    throw new Error('한 번에 한 개의 글만 발행합니다. 여러 글은 나눠서 실행해주세요.');
  }

  const mode: PublishMode = flags.has('--dry-run')
    ? 'dry-run'
    : flags.has('--draft')
      ? 'draft'
      : 'publish';

  const post = loadPost(files[0]!);

  console.log('');
  console.log(`  파일   : ${post.sourcePath}`);
  console.log(`  제목   : ${post.title}`);
  console.log(`  태그   : ${post.tags.length ? post.tags.join(', ') : '(없음)'}`);
  console.log(`  카테고리: ${post.category ?? '(블로그 기본값)'}`);
  console.log(`  모드   : ${mode}`);
  console.log('');

  if (mode === 'publish' && !flags.has('--yes')) {
    if (!(await confirm('이대로 실제 발행할까요?'))) {
      console.log('  취소했습니다.');
      return;
    }
  }

  await publishPost(post, { mode, headless: flags.has('--headless') });
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'login':
      await runLogin();
      break;
    case 'publish':
      await runPublish(args);
      break;
    default:
      console.log(USAGE);
      if (command && command !== 'help' && command !== '--help') {
        process.exitCode = 1;
      }
  }
}

main().catch((err: unknown) => {
  console.error('');
  console.error(err instanceof Error ? err.message : String(err));
  console.error('');
  process.exitCode = 1;
});
