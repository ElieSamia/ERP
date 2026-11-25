import { NextResponse } from 'next/server';
import { makeBackup } from '@/lib/backup';

export const maxDuration = 60;

/** The daily backup, called by Vercel Cron (vercel.json). Vercel sends the CRON_SECRET; nobody else can trigger it. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Not allowed.' }, { status: 401 });
  try { const b = await makeBackup('daily', 'Daily schedule'); return NextResponse.json({ ok: true, name: b.name, docs: b.docs }); }
  catch (e) { console.error('Daily backup failed', e); return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
