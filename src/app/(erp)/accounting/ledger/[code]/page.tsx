import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { contactNames, getChart, ledger, syncAccounting } from '@/lib/accounting';
import { fmtDate, money, periodRange, r2 } from '@/lib/constants';

export default async function LedgerPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ p?: string }> }) {
  if ((await getSession())?.role !== 'admin') return <div className="empty">Only administrators can open Accounting.</div>;
  await syncAccounting();
  const code = (await params).code;
  const p = (await searchParams).p || String(new Date().getFullYear());
  const [from, to] = periodRange(p);
  const [chart, contacts] = await Promise.all([getChart(), contactNames()]);
  const acc = chart.find((a) => a.code === code);
  if (!acc) notFound();
  const { opening, items } = await ledger(code, from, to);
  let run = opening;
  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href={`/accounting?tab=chart&p=${p}`}>Accounting</Link><span className="sep">/</span><span>General ledger, {acc.code} {acc.name}</span></div>
        <div className="cp-tools"><span className="muted">{fmtDate(from)} to {fmtDate(to)}</span></div>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Date</th><th>Entry</th><th>Partner</th><th>Label</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr></thead>
        <tbody>
          <tr><td colSpan={6} className="muted">Opening balance</td><td className="num">{money(opening)}</td></tr>
          {items.map((x, i) => { run = r2(run + x.debit - x.credit); return (
            <tr key={`${x.moveId}-${i}`}><td>{fmtDate(x.date)}</td><td><Link href={`/accounting/entries/${x.moveId}`}><strong>{x.ref}</strong></Link></td>
              <td>{contacts.find((c) => c.id === x.partnerId)?.name ?? ''}</td><td>{x.label}</td>
              <td className="num">{x.debit ? money(x.debit) : ''}</td><td className="num">{x.credit ? money(x.credit) : ''}</td><td className="num">{money(run)}</td></tr>); })}
          {items.length === 0 && <tr><td colSpan={7} className="muted">No movements in this period.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}
