import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';

/** The audit log, newest first: ?kind=&who=&from=&to=&q=; ?format=csv downloads it for Excel. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q: Record<string, unknown> = {};
  if (sp.get('kind')) q.kind = sp.get('kind');
  if (sp.get('who')) q.who = sp.get('who');
  const at: Record<string, Date> = {};
  if (sp.get('from')) at.$gte = new Date(`${sp.get('from')}T00:00:00Z`);
  if (sp.get('to')) at.$lte = new Date(`${sp.get('to')}T23:59:59Z`);
  if (Object.keys(at).length) q.at = at;
  if (sp.get('q')) { const rx = { $regex: sp.get('q')!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }; q.$or = [{ action: rx }, { target: rx }, { detail: rx }, { ip: rx }]; }
  if (sp.get('format') === 'csv') {
    try { await requireUser('admin'); } catch (e) { return handle(async () => { throw e; }); }
    const rows = await (await db()).collection('audit').find(q).sort({ at: -1 }).limit(20000).toArray();
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['When (UTC),Type,Action,Who,Target,Details,IP address', ...rows.map((r) => [(r.at as Date).toISOString().replace('T', ' ').slice(0, 19), r.kind, r.action, r.who, r.target, r.detail, r.ip].map(esc).join(','))].join('\r\n');
    return new Response(`\ufeff${csv}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
  }
  return handle(async () => {
    await requireUser('admin');
    const d = await db();
    const rows = await d.collection('audit').find(q).sort({ at: -1 }).limit(Math.min(Number(sp.get('limit')) || 200, 1000)).toArray();
    return {
      rows: rows.map((r) => ({ id: String(r._id), at: (r.at as Date).toISOString(), kind: r.kind, action: r.action, who: r.who, target: r.target, detail: r.detail, ip: r.ip })),
      people: ((await d.collection('audit').distinct('who')) as string[]).filter(Boolean).sort(),
    };
  });
}
