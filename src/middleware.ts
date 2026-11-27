import { NextResponse, type NextRequest } from 'next/server';
import { PORTAL_COOKIE, SESSION_COOKIE, verifyPortal, verifySession } from '@/lib/session-token';

// Pages and APIs anyone can reach without signing in.
// /s/ is a share link: one document, by an unguessable token that expires.
const PUBLIC = [
  '/login', '/setup', '/api/auth/login', '/api/setup', '/prototype.html', '/s',
  '/portal/login', '/portal/invite', '/api/portal/auth',
  '/logo', // the company logo, for emails and the portal
  '/api/auth/two-step', // the second sign-in step, which has its own short ticket
  '/api/whatsapp/webhook', // Meta's calls, checked by signature instead of a session
  '/api/public', // website enquiries, checked by site key and origin
  '/api/cron', // scheduled jobs (daily backup), checked by CRON_SECRET
  '/enquire', // the hosted enquiry form
];
const isUnder = (path: string, p: string) => path === p || path.startsWith(p + '/');

/** Passes the address and method on, so the server can check the role's permissions for exactly this request. */
const pass = (req: NextRequest) => {
  const h = new Headers(req.headers);
  h.set('x-erp-path', req.nextUrl.pathname); h.set('x-erp-method', req.method);
  return NextResponse.next({ request: { headers: h } });
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => isUnder(pathname, p))) return pass(req);
  const portal = isUnder(pathname, '/portal') || isUnder(pathname, '/api/portal');
  // The portal and the ERP use separate sessions: signing in to one never opens the other.
  const ok = portal
    ? await verifyPortal(req.cookies.get(PORTAL_COOKIE)?.value).catch(() => null)
    : await verifySession(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (ok) return pass(req);
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Your session has ended. Sign in again.' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = portal ? '/portal/login' : '/login';
  url.search = pathname === '/' || pathname === '/portal' ? '' : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
