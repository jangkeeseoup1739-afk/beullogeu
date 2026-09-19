import { NextResponse } from 'next/server';
import { SESSION_COOKIE, safeEqual, sessionToken } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const password = (process.env.ADMIN_PASSWORD ?? '').trim();
  if (!password) {
    return NextResponse.json(
      { ok: false, message: 'ADMIN_PASSWORD 환경 변수가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }

  let input = '';
  try {
    const body = (await request.json()) as { password?: string };
    input = (body.password ?? '').trim();
  } catch {
    input = '';
  }

  if (!safeEqual(input, password)) {
    return NextResponse.json({ ok: false, message: '비밀번호가 맞지 않습니다.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: await sessionToken(password),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}
