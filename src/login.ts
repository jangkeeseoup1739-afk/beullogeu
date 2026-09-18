import { openForLogin, hasAuthCookies, saveSession } from './browser.js';
import { AUTH_FILE } from './config.js';

const LOGIN_PAGE = 'https://nid.naver.com/nidlogin.login';
/** 사람이 2단계 인증까지 마치는 데 걸리는 시간을 넉넉히 잡습니다 */
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 1000;

/**
 * 브라우저를 띄우고 사용자가 직접 로그인하기를 기다립니다.
 *
 * 아이디/비밀번호를 코드가 대신 입력하지 않는 이유:
 *   - 저장소가 public 이므로 자격증명을 두면 그대로 유출됩니다
 *   - 네이버는 자동 로그인에 캡차·기기인증을 걸기 때문에 어차피 막힙니다
 * 사람이 한 번 로그인하고 세션만 재사용하는 편이 안전하고 확실합니다.
 */
export async function runLogin(): Promise<void> {
  const { browser, context } = await openForLogin();
  try {
    const page = await context.newPage();
    await page.goto(LOGIN_PAGE, { waitUntil: 'domcontentloaded' });

    console.log('');
    console.log('  브라우저가 열렸습니다. 네이버에 직접 로그인해주세요.');
    console.log('  (2단계 인증이 있다면 그것까지 마쳐주세요)');
    console.log('');
    console.log('  로그인이 확인되면 자동으로 저장하고 브라우저를 닫습니다.');
    console.log(`  최대 ${LOGIN_TIMEOUT_MS / 60000}분 기다립니다.`);
    console.log('');

    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (page.isClosed()) {
        throw new Error('로그인을 마치기 전에 브라우저가 닫혔습니다.');
      }
      if (await hasAuthCookies(context)) {
        await saveSession(context);
        console.log('  로그인 완료. 세션을 저장했습니다.');
        console.log(`  저장 위치: ${AUTH_FILE}`);
        console.log('');
        console.log('  이 파일은 비밀번호와 같습니다. 절대 공유하거나 커밋하지 마세요.');
        console.log('  (.gitignore 에 이미 등록되어 있습니다)');
        console.log('');
        return;
      }
      await page.waitForTimeout(POLL_INTERVAL_MS);
    }
    throw new Error('제한 시간 안에 로그인이 확인되지 않았습니다. 다시 시도해주세요.');
  } finally {
    await browser.close();
  }
}
