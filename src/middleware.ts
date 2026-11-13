import { NextResponse, type NextRequest } from 'next/server';
import { PORTAL_COOKIE, SESSION_COOKIE, verifyPortal, verifySession } from '@/lib/session-token';

// Pages and APIs anyone can reach without signing in.
// /s/ is a share link: one document, by an unguessable token that expires.
const PUBLIC = [
  '/login', '/setup', '/api/auth/login', '/api/setup', '/prototype.html', '/s',
  '/portal/login', '/portal/invite', '/api/portal/auth',
];
const isUnder = (path: string, p: string) => path === p || path.startsWith(p + '/');

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => isUnder(pathname, p))) return NextResponse.next();
  const portal = isUnder(pathname, '/portal') || isUnder(pathname, '/api/portal');
  // The portal and the ERP use separate sessions: signing in to one never opens the other.
  const ok = portal
    ? await verifyPortal(req.cookies.get(PORTAL_COOKIE)?.value).catch(() => null)
    : await verifySession(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (ok) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Your session has ended. Sign in again.' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = portal ? '/portal/login' : '/login';
  url.search = pathname === '/' || pathname === '/portal' ? '' : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
