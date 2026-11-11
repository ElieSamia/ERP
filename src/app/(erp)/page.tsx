import Link from 'next/link';
import { db } from '@/lib/db';
import { getCompany } from '@/lib/queries';
import { getSession } from '@/lib/auth';
import { Icon } from '@/components/Icon';

const SOON = [
  ['Bookings', 'plane', 'Trip files, services, documents'],
  ['Invoicing', 'doc', 'Invoices, receipts, statements'],
  ['Accounting', 'ledger', 'Lebanese chart of accounts'],
  ['B2B portal', 'globe', 'Agency requests and access'],
] as const;

export default async function Home() {
  const [company, user, d] = await Promise.all([getCompany(), getSession(), db()]);
  const [open, contacts] = await Promise.all([
    d.collection('leads').countDocuments({ stage: { $in: ['new', 'qualified', 'quoted'] } }),
    d.collection('contacts').countDocuments(),
  ]);
  return (
    <section className="home">
      <h1>{company.name || 'Travel ERP'}</h1>
      <p>Welcome, {user?.name.split(' ')[0]}. Everything here is saved to the database.</p>
      <div className="apps">
        <Link className="app" href="/crm"><span className="ico"><Icon name="crm" /></span><b>CRM</b><span>{open} open opportunities</span></Link>
        <Link className="app" href="/contacts"><span className="ico"><Icon name="person" /></span><b>Contacts</b><span>{contacts} customers, agencies and suppliers</span></Link>
        <Link className="app" href="/settings"><span className="ico"><Icon name="gear" /></span><b>Settings</b><span>Company and staff users</span></Link>
        {SOON.map(([n, i, d2]) => (
          <div key={n} className="app soon" aria-disabled="true"><span className="ico"><Icon name={i} /></span><b>{n}</b><span>Coming in the next phases. {d2}.</span></div>
        ))}
      </div>
      <div className="homefoot"><span>The clickable prototype stays available at <a href="/prototype.html">/prototype.html</a> as a reference.</span></div>
    </section>
  );
}
