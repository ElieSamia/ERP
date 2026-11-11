// Signing and checking session tokens. No Next.js server imports here, so the
// middleware (which runs on the edge) can use it too.
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'erp_session';
export const SESSION_HOURS = 8;

export type SessionUser = { sub: string; name: string; email: string; role: 'admin' | 'staff' };

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET must be set to at least 32 characters.');
  return new TextEncoder().encode(secret);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key());
}

export async function verifySession(token?: string): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (typeof payload.sub !== 'string') return null;
    return { sub: payload.sub, name: String(payload.name), email: String(payload.email), role: payload.role === 'admin' ? 'admin' : 'staff' };
  } catch {
    return null;
  }
}
