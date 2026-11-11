import { cookies } from 'next/headers';
import { SESSION_COOKIE, SESSION_HOURS, signSession, verifySession, type SessionUser } from './session-token';

export async function createSession(user: SessionUser) {
  const token = await signSession(user);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function getSession(): Promise<SessionUser | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}
