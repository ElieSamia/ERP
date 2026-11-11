import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { ZodError } from 'zod';
import { getSession } from './auth';
import type { SessionUser } from './session-token';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Every API route checks the session itself. Hiding a button in the UI is never enough. */
export async function requireUser(role?: 'admin'): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw new HttpError(401, 'Your session has ended. Sign in again.');
  if (role === 'admin' && s.role !== 'admin') throw new HttpError(403, 'Only administrators can do this.');
  return s;
}

export function oid(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new HttpError(404, 'Record not found.');
  return new ObjectId(id);
}

export async function handle(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn());
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message || 'Check the form.' }, { status: 400 });
    if (e && typeof e === 'object' && 'code' in e && (e as { code: number }).code === 11000)
      return NextResponse.json({ error: 'A record with this email already exists.' }, { status: 409 });
    console.error(e);
    return NextResponse.json({ error: 'Something went wrong on the server. Try again.' }, { status: 500 });
  }
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
