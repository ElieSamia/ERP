import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPortalCtx, visibleBookings } from '@/lib/portal';
import { PORTAL_STATUS, fmtDate, money, totals, travList, travelDates } from '@/lib/constants';


export default async function PortalBookings() {
  const ctx = await getPortalCtx();
  if (!ctx) redirect('/portal/login');
  if (ctx.perms.bookings === 'none') return <div className="empty">Your access doesn’t include bookings. Ask your account admin.</div>;
  const list = await visibleBookings(ctx);
  const prices = ctx.perms.prices === 'yes';
  return (
    <>
      <div className="cp"><div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Bookings</h1></div>
        <div className="cp-tools"><span className="muted">{ctx.perms.bookings === 'travelling' ? 'Trips you are travelling on.' : `All trips for ${ctx.contactName}.`}</span></div></div>
      {list.length === 0 ? <div className="empty">No bookings yet. They appear here as soon as our team opens a file for you.</div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>File</th><th>Destination</th><th>Dates</th><th className="num">Travellers</th><th>Status</th>{prices && <th className="num">Total</th>}</tr></thead>
          <tbody>{list.map((b) => { const [st, badge] = PORTAL_STATUS[b.status] ?? [b.status, '']; return (
            <tr key={b.id}><td><Link href={`/portal/bookings/${b.id}`}><strong>{b.ref}</strong></Link></td>
              <td>{b.destinationName || b.destination || 'Not set'}</td><td>{travelDates(b) || fmtDate(b.bookingDate)}</td>
              <td className="num">{travList(b.travellers).length || ''}</td><td><span className={`badge ${badge}`}>{st}</span></td>
              {prices && <td className="num">{money(totals(b.lines).total)}</td>}</tr>); })}
          </tbody></table></div>
      )}
    </>
  );
}
