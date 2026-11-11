import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session-token';

// Pages and APIs anyone can reach without signing in.
const PUBLIC = ['/login', '/setup', '/api/auth/login', '/api/setup', '/prototype.html'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next();
  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (user) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Your session has ended. Sign in again.' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
