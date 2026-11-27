import { fmtDate } from '@/lib/constants';
import { passportIssues } from '@/lib/passports';
import { accessFor, areaFor, can } from '@/lib/roles';
import Link from 'next/link';
import { db } from '@/lib/db';
import { getCompany } from '@/lib/queries';
import { getSession } from '@/lib/auth';
import { Icon } from '@/components/Icon';
import { weekCount } from '@/lib/calendar';
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

export default async function Home() {
  const [company, user, d] = await Promise.all([getCompany(), getSession(), db()]);
  const access = user ? await accessFor(user.sub, user.role) : null;
  const show = (href: string) => { const a = areaFor(href); return !a || !access || can(access, a, 'view'); };
  const today = new Date().toISOString().slice(0, 10);
  // Follow-ups due today or overdue, and passport problems on departures in the next 90 days.
  const followUps = show('/crm') ? await d.collection('leads').find({ stage: { $nin: ['won', 'lost'] }, followUpDate: { $gt: '', $lte: today } }).sort({ followUpDate: 1 }).limit(8).toArray() : [];
  const in90 = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const passports = show('/bookings') ? (await d.collection('bookings').find({ status: { $ne: 'cancelled' }, departDate: { $gte: today, $lte: in90 } }).sort({ departDate: 1 }).limit(200).toArray())
    .flatMap((b) => passportIssues(b).map((i) => ({ id: String(b._id), ref: String(b.ref), depart: String(b.departDate), level: i.level, text: i.text })))
    .sort((a, b) => (a.level === 'expired' ? -1 : 0) - (b.level === 'expired' ? -1 : 0) || a.depart.localeCompare(b.depart)).slice(0, 10) : [];
  const [open, contacts, active] = await Promise.all([
    d.collection('leads').countDocuments({ stage: { $in: ['new', 'qualified', 'quoted'] } }),
    d.collection('contacts').countDocuments(),
    activeTrips(d),
  ]);
  const reqs = await d.collection('requests').countDocuments({ status: { $in: ['submitted', 'review', 'quoted', 'approval', 'accepted'] } });
  const [unpaid, openPOs, draftExp] = await Promise.all([
    d.collection('invoices').countDocuments({ status: 'posted' }),
    d.collection('purchases').countDocuments({ status: { $in: ['draft', 'confirmed', 'billed'] } }),
    d.collection('expenses').countDocuments({ status: 'draft' }),
  ]);
  const [products, week] = await Promise.all([d.collection('products').countDocuments({ active: { $ne: false } }), weekCount()]);
  return (
    <section className="home">
      <h1>{company.name || 'Travel ERP'}</h1>
      <p>Welcome, {user?.name.split(' ')[0]}. Everything here is saved to the database.</p>
      <div className="apps">
        {show('/crm') && <Link className="app" href="/crm"><span className="ico"><Icon name="crm" /></span><b>CRM</b><span>{open} open opportunities</span></Link>}
        {show('/bookings') && <Link className="app" href="/bookings"><span className="ico"><Icon name="plane" /></span><b>Bookings</b><span>{active} active trip file{active === 1 ? '' : 's'}</span></Link>}
        {show('/invoicing') && <Link className="app" href="/invoicing"><span className="ico"><Icon name="doc" /></span><b>Invoicing</b><span>{unpaid} unpaid invoice{unpaid === 1 ? '' : 's'}</span></Link>}
        {show('/purchasing') && <Link className="app" href="/purchasing"><span className="ico"><Icon name="cart" /></span><b>Purchasing</b><span>{openPOs} open order{openPOs === 1 ? '' : 's'}</span></Link>}
        {show('/rates') && <Link className="app" href="/rates"><span className="ico"><Icon name="search" /></span><b>Rates desk</b><span>Search flights, hotels, transfers and insurance across providers</span></Link>}
        {show('/calendar') && <Link className="app" href="/calendar"><span className="ico"><Icon name="calendar" /></span><b>Calendar</b><span>{week} item{week === 1 ? '' : 's'} in the next 7 days</span></Link>}
        {show('/expenses') && <Link className="app" href="/expenses"><span className="ico"><Icon name="receipt" /></span><b>Expenses</b><span>{draftExp} draft{draftExp === 1 ? '' : 's'} to post</span></Link>}
        {show('/accounting') && <Link className="app" href="/accounting"><span className="ico"><Icon name="ledger" /></span><b>Accounting</b><span>Journal, reports and VAT</span></Link>}
        {show('/b2b') && <Link className="app" href="/b2b"><span className="ico"><Icon name="globe" /></span><b>B2B portal</b><span>{reqs} open request{reqs === 1 ? '' : 's'} from customers</span></Link>}
        {show('/products') && <Link className="app" href="/products"><span className="ico"><Icon name="tag" /></span><b>Products and pricing</b><span>{products} active product{products === 1 ? '' : 's'} in the catalogue</span></Link>}
        {show('/whatsapp') && <Link className="app" href="/whatsapp"><span className="ico"><Icon name="chat" /></span><b>WhatsApp</b><span>Conversations with customers and suppliers</span></Link>}
        {show('/marketing') && <Link className="app" href="/marketing"><span className="ico"><Icon name="megaphone" /></span><b>Marketing</b><span>Audiences and email campaigns</span></Link>}
        {show('/reports') && <Link className="app" href="/reports"><span className="ico"><Icon name="chart" /></span><b>Reports</b><span>Sales, margins, customers, destinations and pipeline</span></Link>}
        {show('/contacts') && <Link className="app" href="/contacts"><span className="ico"><Icon name="person" /></span><b>Contacts</b><span>{contacts} customers, agencies and suppliers</span></Link>}
        {show('/settings') && <Link className="app" href="/settings"><span className="ico"><Icon name="gear" /></span><b>Settings</b><span>Company, markups, payments and staff users</span></Link>}
      </div>
      {(followUps.length > 0 || passports.length > 0) && <div className="homelists">
        {followUps.length > 0 && <div className="sheet"><h2>Follow-ups due</h2><ul className="hl">{followUps.map((l) => (
          <li key={String(l._id)}><Link href={`/crm/${l._id}`}><b>{String(l.title)}</b></Link><span className={String(l.followUpDate) < today ? 'late' : ''}>{String(l.followUpDate) < today ? 'Overdue since ' : 'Today, '}{fmtDate(String(l.followUpDate))}</span>{l.followUpNote ? <small>{String(l.followUpNote)}</small> : null}</li>))}</ul>
          <Link className="linkbtn" href="/crm?followup=due">All follow-ups due</Link></div>}
        {passports.length > 0 && <div className="sheet"><h2>Passports to check</h2><ul className="hl">{passports.map((x) => (
          <li key={x.id + x.text}><Link href={`/bookings/${x.id}`}><b>{x.ref}</b></Link><span className={x.level === 'expired' ? 'late' : ''}>departs {fmtDate(x.depart)}</span><small>{x.text}</small></li>))}</ul></div>}
      </div>}
      <div className="homefoot"><span>The clickable prototype stays available at <a href="/prototype.html">/prototype.html</a> as a reference.</span></div>
    </section>
  );
}
