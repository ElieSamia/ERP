import { headers } from 'next/headers';
import { db } from './db';

/**
 * The security audit log: sign-ins, failed attempts, access refused, and every sensitive change (settings, users,
 * roles, backups, reservations, cancellations, credit notes, deletions). Kept a year. Never throws.
 */
export type AuditKind = 'sign-in' | 'security' | 'users' | 'settings' | 'backup' | 'finance' | 'reservation' | 'delete' | 'denied';
export async function audit(e: { kind: AuditKind; action: string; who?: string; whoId?: string; target?: string; detail?: string }) {
  try {
    let ip = '', ua = '';
    try { const h = await headers(); ip = (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '').split(',')[0].trim(); ua = (h.get('user-agent') ?? '').slice(0, 200); } catch { /* outside a request */ }
    await (await db()).collection('audit').insertOne({ at: new Date(), kind: e.kind, action: e.action, who: e.who ?? '', whoId: e.whoId ?? '', target: e.target ?? '', detail: (e.detail ?? '').slice(0, 500), ip, ua });
  } catch (err) { console.error('Audit write failed', err); }
}

/** Which changes are logged automatically, by address. */
const RULES: [RegExp, AuditKind, string][] = [
  [/^\/api\/users\/[^/]+\/two-step/, 'security', 'Two-step sign-in reset for a user'],
  [/^\/api\/account\/two-step/, 'security', 'Own two-step sign-in changed'],
  [/^\/api\/backup\/[^/]+\/restore/, 'backup', 'Database restored from a backup'],
  [/^\/api\/backup\/settings\/import/, 'settings', 'Settings imported'],
  [/^\/api\/backup\/settings\/export/, 'settings', 'Settings exported'],
  [/^\/api\/backup/, 'backup', 'Backup made or uploaded'],
  [/^\/api\/(settings|enquiry|marketing\/settings|whatsapp\/settings|rates\/connections)/, 'settings', 'Settings changed'],
  [/^\/api\/bookings\/[^/]+\/provider/, 'reservation', 'Provider reservation action'],
  [/^\/api\/(invoices|purchases)\/[^/]+\/payments\/[^/]+\/cancel/, 'finance', 'Payment cancelled'],
  [/^\/api\/(invoices|purchases)\/[^/]+\/credit/, 'finance', 'Credit note created'],
  [/^\/api\/credits\/[^/]+\/(refund|refunds|allocate)/, 'finance', 'Refund or credit applied'],
];
export function autoAuditFor(path: string, method: string): [AuditKind, string] | null {
  if (method === 'GET') return null;
  for (const [re, k, label] of RULES) if (re.test(path)) return [k, label];
  if (method === 'DELETE') return ['delete', 'Record deleted'];
  return null;
}
