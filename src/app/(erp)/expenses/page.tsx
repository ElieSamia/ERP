import Link from 'next/link';
import { listExpenses, getFinance } from '@/lib/finance';
import { EXP_STATES, fmtDate, label, money, r2, todayISO } from '@/lib/constants';
import { SearchBox } from '@/components/SearchBox';
import { FilterChips } from '@/components/ListChrome';

type SP = Promise<{ q?: string; status?: string }>;

export default async function ExpensesPage({ searchParams }: { searchParams: SP }) {
  const { q, status = 'all' } = await searchParams;
  const [rows, fin] = await Promise.all([listExpenses({ q, status }), getFinance()]);
  const total = (e: { amount: number; vat: number }) => r2(e.amount + r2(e.amount * e.vat / 100));
  const month = todayISO().slice(0, 7);
  const thisMonth = rows.filter((e) => e.status === 'posted' && e.date.startsWith(month));
  const drafts = rows.filter((e) => e.status === 'draft').length;
  const paidLabel = (id: string) => (id === 'supplier' ? 'On credit' : fin.accounts.find((a) => a.id === id)?.name ?? id);
  return (
    <>
      <div className="cp">
        <div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Expenses</h1></div>
        <div className="cp-actions"><Link className="btn primary" href="/expenses/new">New expense</Link></div>
        <div className="cp-tools"><SearchBox placeholder="Search description or receipt number" /><FilterChips base="/expenses" current={status} q={q} items={EXP_STATES} /></div>
      </div>
      <div className="banner"><strong>{new Date(month + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</strong>
        <span className="muted">{money(thisMonth.reduce((s, e) => s + total(e), 0))} posted across {thisMonth.length} expense{thisMonth.length === 1 ? '' : 's'}</span>
        {drafts > 0 && <span className="muted">{drafts} draft{drafts === 1 ? '' : 's'} waiting to be posted</span>}</div>
      {rows.length === 0 ? <div className="empty">{q || status !== 'all' ? 'No expenses match this search or filter.' : 'No expenses yet. Record water, stationery, rent and other running costs here.'}</div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th>Category</th><th>Paid from</th><th>Status</th><th className="num">Total</th></tr></thead>
          <tbody>{rows.map((e) => (
            <tr key={e.id}><td>{fmtDate(e.date)}</td><td>{e.ref}</td><td><Link href={`/expenses/${e.id}`}><strong>{e.description}</strong></Link></td>
              <td>{fin.categories.find((c) => c.id === e.categoryId)?.name ?? e.categoryId}</td><td>{paidLabel(e.paidFrom)}{e.supplierName ? `, ${e.supplierName}` : ''}</td>
              <td><span className={`badge ${e.status === 'posted' ? 'b-green' : ''}`}>{label(EXP_STATES, e.status)}</span></td><td className="num">{money(total(e))}</td></tr>))}
          </tbody></table></div>
      )}
    </>
  );
}
