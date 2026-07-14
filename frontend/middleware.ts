import { NextRequest, NextResponse } from 'next/server';
import { backendBaseUrl } from '@/lib/backendConfig';

const SESSION_COOKIE = 'gold_grith_wallet_session';
const CONNECT_PATH = '/dashboard/sodex/connect';

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === CONNECT_PATH) {
    return NextResponse.next();
  }

  let backend: string | null = null;
  try { backend = backendBaseUrl(); } catch {}
  const cookie = request.headers.get('cookie');
  if (backend && cookie) {
    try {
      const verification = await fetch(`${backend}/api/sodex/session/verify`, {
        headers: { Cookie: cookie, 'X-Forwarded-Proto': request.nextUrl.protocol.replace(':', '') },
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000)
      });
      if (verification.ok) return NextResponse.next();
    } catch {}
  }

  const loginUrl = new URL(CONNECT_PATH, request.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = {
  matcher: ['/dashboard/:path*']
};
