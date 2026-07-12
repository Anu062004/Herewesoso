import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://3.87.110.3:3001';

async function handler(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  const search = req.nextUrl.search;
  const url = `${BACKEND}/api/${path}${search}`;

  const isBody = req.method !== 'GET' && req.method !== 'HEAD';
  const body = isBody ? await req.text() : undefined;

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(req.headers.get('cookie') ? { Cookie: req.headers.get('cookie') as string } : {}),
        'X-Forwarded-Proto': req.nextUrl.protocol.replace(':', '')
      },
      body,
      cache: 'no-store',
    });

    const text = await upstream.text();
    const response = new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) response.headers.set('Set-Cookie', setCookie);
    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
