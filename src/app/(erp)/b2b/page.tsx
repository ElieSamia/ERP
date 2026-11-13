import Link from 'next/link';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getPortalSettings, getRoles, toRequest } from '@/lib/portal';
import { REQ_STATES, REQ_BADGE, OPEN_REQ, SERVICE_TYPES, fmtDateTime, fmtRange, label, money } from '@/lib/constants';
import { Tabs, FilterChips } from '@/components/ListChrome';
import { SearchBox } from '@/components/SearchBox';
import { RolesPanel, PortalSettingsForm } from '@/components/PortalAdmin';

type SP = Promise<{ tab?: string; status?: string; q?: string }>;

export default async function B2BPage({ searchParams }: { searchParams: SP }) {
  const { tab = 'requests', status = 'open', q } = await searchParams;
  const user = (await getSession())!;
  const d = await db();
  let body: React.ReactNode = null;
  if (tab === 'requests') {
    const f: Record<string, unknown> = {};
    if (status === 'open') f.status = { $in: OPEN_REQ }; else if (status !== 'all') f.status = status;
    const list = (await d.collection('requests').find(f).sort({ createdAt: -1 }).limit(300).toArray()).map(toRequest);
    const cs = await d.collection('contacts').find({}, { projection: { name: 1 } }).toArray();
    const name = (id: string) => String(cs.find((c) => String(c._id) === id)?.name ?? '');
    const rows = q ? list.filter((r) => [r.ref, r.title, r.destination, name(r.contactId)].join(' ').toLowerCase().includes(q.toLowerCase())) : list;
    const needs = (r: (typeof list)[number]) => r.status === 'submitted' || r.status === 'accepted' || (OPEN_REQ.includes(r.status) && r.messages.at(-1)?.side === 'customer');
    body = (
      <>
        <div className="cp-tools" style={{ marginBottom: 12 }}>
          <SearchBox placeholder="Search requests or accounts" />
          <FilterChips base="/b2b" current={status} q={q} items={[['open', 'Open'], ...REQ_STATES]} extra={{ tab: 'requests' }} />
        </div>
        {rows.length === 0 ? <div className="empty">No requests here. Customers send requests from the portal once they have access.</div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Request</th><th>Account</th><th>What</th><th>Service</th><th>Dates</th><th>Status</th><th className="num">Quote</th><th>Last update</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/b2b/requests/${r.id}`}><strong>{r.ref}</strong></Link>{needs(r) && <> <span className="badge b-red">Needs you</span></>}</td>
                <td>{name(r.contactId)}</td><td>{r.title}</td><td>{label(SERVICE_TYPES, r.type)}</td><td>{fmtRange(r.dateFrom, r.dateTo)}</td>
                <td><span className={`badge ${REQ_BADGE[r.status]}`}>{label(REQ_STATES, r.status)}</span></td>
                <td className="num">{r.quote ? money(r.quote.amount) : ''}</td><td>{fmtDateTime(r.messages.at(-1)?.at ?? r.createdAt)}</td>
              </tr>))}
            </tbody></table></div>
        )}
      </>
    );
  } else if (tab === 'accounts') {
    const cs = await d.collection('contacts').find({ $or: [{ portalAccess: 'yes' }, { type: 'agency' }] }).sort({ name: 1 }).toArray();
    const users = await d.collection('portalUsers').aggregate([{ $group: { _id: '$contactId', n: { $sum: 1 }, active: { $sum: { $cond: ['$active', 1, 0] } } } }]).toArray();
    const open = await d.collection('requests').aggregate([{ $match: { status: { $in: OPEN_REQ } } }, { $group: { _id: '$contactId', n: { $sum: 1 } } }]).toArray();
    body = cs.length === 0 ? <div className="empty">No customer has portal access yet. Open a contact and tick Portal access, then invite its users here.</div> : (
      <>
        <div className="table-wrap"><table>
          <thead><tr><th>Account</th><th>Side</th><th>Portal</th><th className="num">Users</th><th className="num">Open requests</th></tr></thead>
          <tbody>{cs.map((c) => { const u = users.find((x) => x._id === String(c._id)); return (
            <tr key={String(c._id)}><td><Link href={`/b2b/accounts/${c._id}`}><strong>{String(c.name)}</strong></Link></td><td>{c.type === 'supplier' ? 'Supplier' : 'Customer'}</td>
              <td>{c.portalAccess === 'yes' ? <span className="badge b-green">Enabled</span> : <span className="badge b-red">Disabled</span>}</td>
              <td className="num">{u ? `${u.active} of ${u.n} active` : '0'}</td><td className="num">{c.type === 'supplier' ? '' : open.find((x) => x._id === String(c._id))?.n ?? 0}</td></tr>); })}
          </tbody></table></div>
        <p className="hint">Any customer, agency, corporate account or supplier can use the portal: tick Portal access on its contact, then invite its people here. Suppliers see their purchase orders, bills and payments instead of requests and bookings.</p>
      </>
    );
  } else if (tab === 'roles') {
    body = <RolesPanel initial={await getRoles()} canEdit={user.role === 'admin'} />;
  } else {
    body = <PortalSettingsForm initial={await getPortalSettings()} canEdit={user.role === 'admin'} />;
  }
  return (
    <>
      <div className="cp">
        <div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>B2B portal</h1></div>
        <div className="cp-actions"><a className="btn" href="/portal/login" target="_blank" rel="noopener">Open the portal sign-in page</a></div>
        <Tabs base="/b2b" current={tab} items={[['requests', 'Requests'], ['accounts', 'Accounts'], ['roles', 'Roles'], ['settings', 'Settings']]} />
      </div>
      {body}
    </>
  );
}
