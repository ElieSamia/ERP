import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPortalCtx, visibleRequests } from '@/lib/portal';
import { REQ_STATES, REQ_BADGE, SERVICE_TYPES, OPEN_REQ, fmtDateTime, fmtRange, label } from '@/lib/constants';

export default async function PortalRequests({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const ctx = await getPortalCtx();
  if (!ctx) redirect('/portal/login');
  if (ctx.perms.requests === 'none') return <div className="empty">Your access doesn’t include requests.</div>;
  const f = (await searchParams).f || 'all';
  const all = await visibleRequests(ctx);
  const rows = all.filter((r) => f === 'all' || (f === 'open' ? OPEN_REQ.includes(r.status) : !OPEN_REQ.includes(r.status)));
  return (
    <>
      <div className="cp">
        <div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Requests</h1></div>
        <div className="cp-actions">{ctx.perms.requests === 'create' && <Link className="btn primary" href="/portal/requests/new">New request</Link>}</div>
        <div className="cp-tools"><div className="chips">{[['all', 'All'], ['open', 'Open'], ['closed', 'Closed']].map(([k, l]) => <Link key={k} className={`chip ${f === k ? 'on' : ''}`} href={`/portal/requests?f=${k}`}>{l}</Link>)}</div></div>
      </div>
      {rows.length === 0 ? <div className="empty">{all.length ? 'No requests match this filter.' : 'No requests yet. Use New request to ask for flights, hotels, packages, visas and more.'}</div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Request</th><th>What</th><th>Service</th><th>Dates</th><th>Status</th><th>Last update</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td><Link href={`/portal/requests/${r.id}`}><strong>{r.ref}</strong></Link></td><td>{r.title}</td><td>{label(SERVICE_TYPES, r.type)}</td><td>{fmtRange(r.dateFrom, r.dateTo)}</td>
              <td><span className={`badge ${REQ_BADGE[r.status]}`}>{label(REQ_STATES, r.status)}</span>{r.status === 'quoted' && ctx.perms.acceptQuotes === 'yes' && <> <span className="badge b-red">Action needed</span></>}</td>
              <td>{fmtDateTime(r.messages.at(-1)?.at ?? r.createdAt)}</td></tr>))}
          </tbody></table></div>
      )}
    </>
  );
}
