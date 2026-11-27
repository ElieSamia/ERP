import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { db } from './db';

/**
 * Staff roles: per app, No access / View / Edit, plus whether costs and margins are visible. Administrators have
 * everything (and are the only ones who see Settings, users, roles and the audit log). One central check covers
 * every page and API route, from the address of the request.
 */
import { AREAS, type Area, type Level, type Role } from './areas';
export { AREAS, type Area, type Level, type Role };
const all = (l: Level) => Object.fromEntries(AREAS.map(([k]) => [k, l])) as Record<Area, Level>;
const pick = (base: Level, over: Partial<Record<Area, Level>>) => ({ ...all(base), ...over });
export const DEFAULT_ROLES: Role[] = [
  { id: 'staff-full', name: 'Staff (full access)', perms: all('edit'), costs: true, builtin: true },
  { id: 'sales', name: 'Sales', costs: false, perms: pick('none', { crm: 'edit', bookings: 'edit', rates: 'edit', calendar: 'edit', contacts: 'edit', products: 'view', marketing: 'edit', whatsapp: 'edit', portal: 'view', invoicing: 'view' }) },
  { id: 'reservations', name: 'Reservations', costs: true, perms: pick('none', { crm: 'view', bookings: 'edit', rates: 'edit', calendar: 'edit', contacts: 'edit', products: 'view', purchasing: 'edit', whatsapp: 'edit', portal: 'edit', invoicing: 'view' }) },
  { id: 'accounts', name: 'Accounts', costs: true, perms: pick('none', { invoicing: 'edit', purchasing: 'edit', expenses: 'edit', accounting: 'edit', reports: 'view', contacts: 'view', bookings: 'view', calendar: 'view', crm: 'view' }) },
  { id: 'viewer', name: 'Viewer', costs: false, perms: pick('view', { accounting: 'none', expenses: 'none', purchasing: 'none' }) },
];

export async function listRoles(): Promise<Role[]> {
  const col = (await db()).collection<{ _id: string } & Omit<Role, 'id'>>('roles');
  if (!(await col.countDocuments())) await col.insertMany(DEFAULT_ROLES.map(({ id, ...r }) => ({ _id: id, ...r })));
  return (await col.find({}).toArray()).map(({ _id, ...r }) => ({ id: String(_id), ...r, perms: { ...all('none'), ...r.perms } }));
}

/* ---------- Which app an address belongs to ---------- */
const PAGE: [string, Area][] = [
  ['/crm', 'crm'], ['/bookings', 'bookings'], ['/rates', 'rates'], ['/calendar', 'calendar'], ['/products', 'products'], ['/contacts', 'contacts'],
  ['/invoicing', 'invoicing'], ['/purchasing', 'purchasing'], ['/expenses', 'expenses'], ['/accounting', 'accounting'], ['/reports', 'reports'],
  ['/marketing', 'marketing'], ['/whatsapp', 'whatsapp'], ['/b2b', 'portal'],
  ['/print/booking', 'bookings'], ['/print/vouchers', 'bookings'], ['/print/invoice', 'invoicing'], ['/print/receipt', 'invoicing'], ['/print/credit', 'invoicing'],
  ['/print/refund', 'invoicing'], ['/print/statement', 'invoicing'], ['/print/po', 'purchasing'], ['/print/voucher', 'purchasing'], ['/print/supstatement', 'purchasing'],
];
const API: [string, Area][] = [
  ['/api/leads', 'crm'], ['/api/bookings', 'bookings'], ['/api/rates', 'rates'], ['/api/reminders', 'calendar'], ['/api/calendar', 'calendar'],
  ['/api/products', 'products'], ['/api/contacts', 'contacts'], ['/api/invoices', 'invoicing'], ['/api/credits', 'invoicing'], ['/api/purchases', 'purchasing'],
  ['/api/expenses', 'expenses'], ['/api/accounting', 'accounting'], ['/api/moves', 'accounting'], ['/api/reports', 'reports'], ['/api/marketing', 'marketing'],
  ['/api/whatsapp', 'whatsapp'], ['/api/b2b', 'portal'],
];
const under = (p: string, x: string) => p === x || p.startsWith(`${x}/`);
// Lookups that other screens need (choosing a customer on a booking, a product from the catalogue): readable by all staff.
const LOOKUPS = ['/api/contacts', '/api/products'];
export function areaFor(path: string, method = 'GET'): Area | null {
  if (method === 'GET' && LOOKUPS.some((x) => path === x)) return null;
  for (const [x, a] of path.startsWith('/api/') ? API : PAGE) if (under(path, x)) return a;
  return null;
}

/* ---------- A person's access (short cache: role changes apply within seconds) ---------- */
export type Access = { admin: boolean; perms: Record<Area, Level>; costs: boolean; roleName: string };
const cache = new Map<string, { at: number; a: Access }>();
export async function accessFor(sub: string, role: 'admin' | 'staff'): Promise<Access> {
  if (role === 'admin') return { admin: true, perms: all('edit'), costs: true, roleName: 'Administrator' };
  const hit = cache.get(sub);
  if (hit && Date.now() - hit.at < 15000) return hit.a;
  const u = ObjectId.isValid(sub) ? await (await db()).collection('users').findOne({ _id: new ObjectId(sub) }, { projection: { roleId: 1 } }) : null;
  const roles = await listRoles();
  const r = roles.find((x) => x.id === (u?.roleId || 'staff-full')) ?? roles.find((x) => x.id === 'staff-full')!;
  const a = { admin: false, perms: r.perms, costs: r.costs, roleName: r.name };
  cache.set(sub, { at: Date.now(), a });
  return a;
}
export const forgetAccess = () => cache.clear();
export const can = (a: Access, area: Area, need: 'view' | 'edit') => a.admin || a.perms[area] === 'edit' || (need === 'view' && a.perms[area] === 'view');

export const roleSchema = z.object({
  name: z.string().trim().min(2, 'Name the role.').max(50),
  perms: z.record(z.enum(AREAS.map(([k]) => k) as [string, ...string[]]), z.enum(['none', 'view', 'edit'])),
  costs: z.boolean(),
});

export const roleSummary = (r: { perms: Record<string, string>; costs: boolean }) =>
  `${AREAS.map(([k, l]) => `${l}: ${r.perms[k] ?? 'none'}`).join(', ')}; costs ${r.costs ? 'visible' : 'hidden'}`;
