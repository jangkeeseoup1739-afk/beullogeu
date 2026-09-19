/**
 * 관리자 로그인.
 *
 * 비밀번호 자체를 쿠키에 담지 않습니다. 비밀번호의 해시를 쿠키에 담고,
 * 요청이 올 때마다 환경 변수의 비밀번호로 만든 해시와 비교합니다.
 * Web Crypto 를 쓰기 때문에 미들웨어(Edge)와 API 라우트(Node) 양쪽에서 같은 코드가 동작합니다.
 */
export const SESSION_COOKIE = 'rta_admin';

export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`realestate-threads-auto:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** 길이가 달라도 같은 시간이 걸리도록 비교합니다. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  const password = (process.env.ADMIN_PASSWORD ?? '').trim();
  if (!password || !cookieValue) return false;
  return safeEqual(cookieValue, await sessionToken(password));
}

/** GitHub Actions 같은 외부 실행기가 보낸 요청인지 확인합니다. */
export function isValidCronRequest(headers: Headers): boolean {
  const secret = (process.env.CRON_SECRET ?? '').trim();
  if (!secret) return false;
  const headerValue = headers.get('x-cron-secret') ?? '';
  const bearer = (headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  return safeEqual(headerValue, secret) || safeEqual(bearer, secret);
}
