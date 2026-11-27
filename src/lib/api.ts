import { headers } from 'next/headers';
import { audit, autoAuditFor } from './audit';
import { AREAS, accessFor, areaFor, can } from './roles';
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
/**
 * The signed-in staff member, after checking their role allows this request: the page guard passes the address
 * and method, and the role's level for that app must be View (to read) or Edit (to change). Sensitive changes and
 * refused attempts go to the audit log.
 */
export async function requireUser(role?: 'admin'): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw new HttpError(401, 'Your session has ended. Sign in again.');
  let path = '', method = 'GET';
  try { const h = await headers(); path = h.get('x-erp-path') ?? ''; method = h.get('x-erp-method') ?? 'GET'; } catch { /* not in a request */ }
  if (role === 'admin' && s.role !== 'admin') {
    await audit({ kind: 'denied', action: 'Administrator-only action refused', who: s.name, whoId: s.sub, target: `${method} ${path}` });
    throw new HttpError(403, 'Only administrators can do this.');
  }
  if (path && s.role !== 'admin') {
    const area = areaFor(path, method);
    if (area) {
      const a = await accessFor(s.sub, s.role);
      const need = method === 'GET' ? 'view' : 'edit';
      // Credit notes serve both sides: the customer side needs Invoicing, the supplier side Purchasing.
      const ok = can(a, area, need) || (path.startsWith('/api/credits') && can(a, 'purchasing', need));
      if (!ok) {
        await audit({ kind: 'denied', action: `Access refused (${a.roleName})`, who: s.name, whoId: s.sub, target: `${method} ${path}` });
        throw new HttpError(403, `Your role (${a.roleName}) ${need === 'view' ? 'can’t open' : 'can only view'} ${AREAS.find(([k]) => k === area)?.[1] ?? 'this'}. Ask an administrator if you need more.`);
      }
    }
  }
  const rule = path ? autoAuditFor(path, method) : null;
  if (rule) await audit({ kind: rule[0], action: rule[1], who: s.name, whoId: s.sub, target: `${method} ${path}` });
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
    // Some errors carry details the screen needs, such as the new price when a provider's price changed.
    if (e instanceof HttpError) return NextResponse.json({ error: e.message, ...((e as HttpError & { extra?: object }).extra ?? {}) }, { status: e.status });
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message || 'Check the form.' }, { status: 400 });
    if (e && typeof e === 'object' && 'code' in e && (e as { code: number }).code === 11000)
      return NextResponse.json({ error: 'A record with this email already exists.' }, { status: 409 });
    console.error(e);
    return NextResponse.json({ error: 'Something went wrong on the server. Try again.' }, { status: 500 });
  }
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
