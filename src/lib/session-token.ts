// Signing and checking session tokens. No Next.js server imports here, so the
// middleware (which runs on the edge) can use it too.
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'erp_session';
export const PORTAL_COOKIE = 'portal_session';
export const SESSION_HOURS = 8;

export type SessionUser = { sub: string; name: string; email: string; role: 'admin' | 'staff' };
/** A portal user: someone at a customer (or later a supplier) account. Never a staff user. */
export type PortalUser = { sub: string; name: string; email: string; contactId: string };

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET must be set to at least 32 characters.');
  return new TextEncoder().encode(secret);
}

// Staff and portal tokens carry different audiences, so a portal session can never be used as a staff session.
export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user }).setProtectedHeader({ alg: 'HS256' }).setAudience('staff').setIssuedAt().setExpirationTime(`${SESSION_HOURS}h`).sign(key());
}

export async function verifySession(token?: string): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { audience: 'staff' });
    if (typeof payload.sub !== 'string') return null;
    return { sub: payload.sub, name: String(payload.name), email: String(payload.email), role: payload.role === 'admin' ? 'admin' : 'staff' };
  } catch {
    return null;
  }
}

export async function signPortal(user: PortalUser): Promise<string> {
  return new SignJWT({ ...user }).setProtectedHeader({ alg: 'HS256' }).setAudience('portal').setIssuedAt().setExpirationTime(`${SESSION_HOURS}h`).sign(key());
}

export async function verifyPortal(token?: string): Promise<PortalUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { audience: 'portal' });
    if (typeof payload.sub !== 'string' || typeof payload.contactId !== 'string') return null;
    return { sub: payload.sub, name: String(payload.name), email: String(payload.email), contactId: payload.contactId };
  } catch {
    return null;
  }
}

/* The step between a correct password and the 6-digit code: a 5-minute ticket naming the user, nothing more. */
export const TWO_STEP_COOKIE = 'erp_2fa';
export async function signTicket(sub: string): Promise<string> {
  return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setAudience('two-step').setSubject(sub).setIssuedAt().setExpirationTime('5m').sign(key());
}
export async function verifyTicket(token?: string): Promise<string | null> {
  if (!token) return null;
  try { const { payload } = await jwtVerify(token, key(), { audience: 'two-step' }); return typeof payload.sub === 'string' ? payload.sub : null; } catch { return null; }
}
