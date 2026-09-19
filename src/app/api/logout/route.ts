import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

/** 로그아웃 후 로그인 화면으로 보냅니다. (관리자 화면의 폼에서 직접 호출) */
export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/login', request.url), 303);
  response.cookies.set({ name: SESSION_COOKIE, value: '', path: '/', maxAge: 0 });
  return response;
}
