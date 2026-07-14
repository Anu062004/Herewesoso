import { NextRequest, NextResponse } from 'next/server';
import { backendBaseUrl } from '@/lib/backendConfig';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_BODY_BYTES = 64 * 1024;
export const maxDuration = 300;

async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  if (!segments.length || segments.some((segment) => !/^[A-Za-z0-9._~-]+$/.test(segment))) {
    return NextResponse.json({ error: 'Invalid API path.', code: 'INVALID_PROXY_PATH' }, { status: 400 });
  }
  const path = segments.join('/');
  const search = req.nextUrl.search;
  const incomingRequestId = req.headers.get('x-request-id');
  const requestId = incomingRequestId && /^[A-Za-z0-9._-]{8,128}$/.test(incomingRequestId)
    ? incomingRequestId
    : crypto.randomUUID();

  if (MUTATING_METHODS.has(req.method)) {
    const origin = req.headers.get('origin');
    const fetchSite = req.headers.get('sec-fetch-site');
    if ((origin && origin !== req.nextUrl.origin) || fetchSite === 'cross-site') {
      return NextResponse.json({ error: 'Cross-site mutation denied.', code: 'CSRF_DENIED', requestId }, { status: 403 });
    }
  }

  const isBody = MUTATING_METHODS.has(req.method);
  const body = isBody ? await req.text() : undefined;
  if (body && !req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Request body must be JSON.', code: 'UNSUPPORTED_MEDIA_TYPE', requestId }, { status: 415 });
  }
  if (body && new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request body is too large.', code: 'PAYLOAD_TOO_LARGE', requestId }, { status: 413 });
  }

  try {
    const url = `${backendBaseUrl()}/api/${path}${search}`;
    const upstream = await fetch(url, {
      method: req.method,
      headers: {
        ...(req.headers.get('content-type') ? { 'Content-Type': req.headers.get('content-type') as string } : {}),
        Accept: 'application/json',
        ...(req.headers.get('cookie') ? { Cookie: req.headers.get('cookie') as string } : {}),
        Origin: req.nextUrl.origin,
        'X-Forwarded-Proto': req.nextUrl.protocol.replace(':', ''),
        'X-Request-Id': requestId
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(path === 'trigger' ? 240_000 : 30_000)
    });

    const text = await upstream.text();
    const response = new NextResponse(text, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
        'X-Request-Id': upstream.headers.get('x-request-id') || requestId
      },
    });
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) response.headers.set('Set-Cookie', setCookie);
    return response;
  } catch {
    return NextResponse.json(
      { error: 'The backend service is unavailable.', code: 'BACKEND_UNAVAILABLE', requestId },
      { status: 502, headers: { 'X-Request-Id': requestId } }
    );
  }
}

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export const PUT = handler;
export const PATCH = handler;
export const OPTIONS = handler;
