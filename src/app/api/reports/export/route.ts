import { HttpError, requireUser, handle } from '@/lib/api';
import { crmIn, reportPeriod, reportTables, salesIn, toCsv } from '@/lib/reports';
import { todayISO } from '@/lib/constants';

/** Downloads one report table as a CSV file that opens directly in Excel. */
export async function GET(req: Request) {
  try {
    await requireUser();
    const q = new URL(req.url).searchParams;
    const per = reportPeriod(q.get('p') ?? '', todayISO());
    const tables = await reportTables(await salesIn(per.from, per.to), per.months, await crmIn(per.from, per.to));
    const t = tables[q.get('r') ?? ''];
    if (!t) throw new HttpError(404, 'Report not found.');
    const csv = toCsv(t.cols.map((c) => c.h), [...t.rows, ...(t.total ? [t.total] : [])]);
    const name = `${t.title} ${per.label}`.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').toLowerCase();
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"`, 'Cache-Control': 'no-store' } });
  } catch (e) {
    return handle(async () => { throw e; });
  }
}
