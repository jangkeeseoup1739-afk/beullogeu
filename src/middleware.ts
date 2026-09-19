/**
 * 관리자 화면과 관리자 API를 비밀번호로 보호합니다.
 * /api/cron/* 은 CRON_SECRET 으로 각 라우트에서 직접 확인하므로 여기서는 통과시킵니다.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, isValidSession } from './lib/auth';

const PUBLIC_PATHS = ['/login', '/api/login', '/api/cron'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const authorized = await isValidSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (authorized) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/', '/admin/:path*', '/api/:path*'],
};
