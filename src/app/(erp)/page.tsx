import Link from 'next/link';
import { db } from '@/lib/db';
import { getCompany } from '@/lib/queries';
import { getSession } from '@/lib/auth';
import { Icon } from '@/components/Icon';
import type { Db } from 'mongodb';

/** A trip file is active until its travel is over, whatever its invoicing status. Cancelled files never count. */
async function activeTrips(d: Db) {
  const today = new Date().toISOString().slice(0, 10);
  const list = await d.collection('bookings').find({ status: { $ne: 'cancelled' } }, { projection: { departDate: 1, returnDate: 1, lines: 1 } }).toArray();
  return list.filter((b) => {
    const dates = [b.departDate, b.returnDate, ...((b.lines as { date?: string; dateTo?: string }[]) || []).flatMap((l) => [l.date, l.dateTo])].filter(Boolean) as string[];
    return dates.length === 0 || dates.some((x) => x >= today);
  }).length;
}

const SOON = [
  ['B2B portal', 'globe', 'Agency requests and access'],
] as const;

export default async function Home() {
  const [company, user, d] = await Promise.all([getCompany(), getSession(), db()]);
  const [open, contacts, active] = await Promise.all([
    d.collection('leads').countDocuments({ stage: { $in: ['new', 'qualified', 'quoted'] } }),
    d.collection('contacts').countDocuments(),
    activeTrips(d),
  ]);
  const [unpaid, openPOs, draftExp] = await Promise.all([
    d.collection('invoices').countDocuments({ status: 'posted' }),
    d.collection('purchases').countDocuments({ status: { $in: ['draft', 'confirmed', 'billed'] } }),
    d.collection('expenses').countDocuments({ status: 'draft' }),
  ]);
  return (
    <section className="home">
      <h1>{company.name || 'Travel ERP'}</h1>
      <p>Welcome, {user?.name.split(' ')[0]}. Everything here is saved to the database.</p>
      <div className="apps">
        <Link className="app" href="/crm"><span className="ico"><Icon name="crm" /></span><b>CRM</b><span>{open} open opportunities</span></Link>
        <Link className="app" href="/bookings"><span className="ico"><Icon name="plane" /></span><b>Bookings</b><span>{active} active trip file{active === 1 ? '' : 's'}</span></Link>
        <Link className="app" href="/invoicing"><span className="ico"><Icon name="doc" /></span><b>Invoicing</b><span>{unpaid} unpaid invoice{unpaid === 1 ? '' : 's'}</span></Link>
        <Link className="app" href="/purchasing"><span className="ico"><Icon name="cart" /></span><b>Purchasing</b><span>{openPOs} open order{openPOs === 1 ? '' : 's'}</span></Link>
        <Link className="app" href="/expenses"><span className="ico"><Icon name="receipt" /></span><b>Expenses</b><span>{draftExp} draft{draftExp === 1 ? '' : 's'} to post</span></Link>
        <Link className="app" href="/accounting"><span className="ico"><Icon name="ledger" /></span><b>Accounting</b><span>Journal, reports and VAT, administrators only</span></Link>
        <Link className="app" href="/contacts"><span className="ico"><Icon name="person" /></span><b>Contacts</b><span>{contacts} customers, agencies and suppliers</span></Link>
        <Link className="app" href="/settings"><span className="ico"><Icon name="gear" /></span><b>Settings</b><span>Company, markups, payments and staff users</span></Link>
        {SOON.map(([n, i, d2]) => (
          <div key={n} className="app soon" aria-disabled="true"><span className="ico"><Icon name={i} /></span><b>{n}</b><span>Coming in the next phases. {d2}.</span></div>
        ))}
      </div>
      <div className="homefoot"><span>The clickable prototype stays available at <a href="/prototype.html">/prototype.html</a> as a reference.</span></div>
    </section>
  );
}
