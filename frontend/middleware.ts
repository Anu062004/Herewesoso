import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'gold_grith_wallet_session';
const CONNECT_PATH = '/dashboard/sodex/connect';

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === CONNECT_PATH || request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }

  const loginUrl = new URL(CONNECT_PATH, request.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/dashboard/:path*']
};
