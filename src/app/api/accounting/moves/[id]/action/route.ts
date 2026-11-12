import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { getChart, getMove } from '@/lib/accounting';
import { nextNumber } from '@/lib/finance';
import { logActivity } from '@/lib/activity';
import { money, r2 } from '@/lib/constants';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser('admin');
    const id = (await params).id;
    const { action } = z.object({ action: z.enum(['post', 'draft']) }).parse(await req.json());
    const col = (await db()).collection('moves');
    const m = await col.findOne({ _id: oid(id) });
    if (!m) throw new HttpError(404, 'Entry not found.');
    if (m.auto) throw new HttpError(409, 'This entry comes from a document. Change the document instead.');
    if (action === 'post') {
      if (m.status !== 'draft') throw new HttpError(409, 'This entry is already posted.');
      const lines = ((m.lines as { account: string; debit: number; credit: number }[]) || []).filter((l) => l.debit || l.credit);
      if (lines.length < 2) throw new HttpError(400, 'An entry needs at least two lines with amounts.');
      const codes = new Set((await getChart()).map((a) => a.code));
      if (lines.some((l) => !codes.has(l.account))) throw new HttpError(400, 'Choose an account on every line that has an amount.');
      if (lines.some((l) => l.debit && l.credit)) throw new HttpError(400, 'A line can have a debit or a credit, not both.');
      const dr = r2(lines.reduce((s, l) => s + l.debit, 0)), cr = r2(lines.reduce((s, l) => s + l.credit, 0));
      if (Math.abs(dr - cr) > 0.004) throw new HttpError(400, `Debits and credits differ by ${money(Math.abs(dr - cr))}. Balance the entry before posting.`);
      const y = String(m.date).slice(0, 4);
      const ref = m.ref || `${m.journal}/${y}/${String(await nextNumber(`move-${m.journal}-${y}`)).padStart(4, '0')}`;
      await col.updateOne({ _id: oid(id) }, { $set: { status: 'posted', ref, lines: m.lines.filter((l: { debit: number; credit: number }) => l.debit || l.credit), postedAt: new Date(), postedBy: user.name } });
      await logActivity('move', id, user.name, `Posted as ${ref}.`);
    } else {
      if (m.status !== 'posted') throw new HttpError(409, 'Only posted entries can go back to draft.');
      await col.updateOne({ _id: oid(id) }, { $set: { status: 'draft' } });
      await logActivity('move', id, user.name, 'Reset to draft. It keeps its number.');
    }
    return getMove(id);
  });
}
