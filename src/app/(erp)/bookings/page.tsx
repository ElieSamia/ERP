import Link from 'next/link';
import { listBookings } from '@/lib/bookings';
import { BOOKING_STATES, BOOK_BADGE, CHANNEL, label, money, totals, travelDates } from '@/lib/constants';
import { SearchBox } from '@/components/SearchBox';

type SP = Promise<{ q?: string; status?: string }>;

export default async function BookingsPage({ searchParams }: { searchParams: SP }) {
  const { q, status = 'all' } = await searchParams;
  const rows = await listBookings({ q, status });
  const chip = (k: string, l: string) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (k !== 'all') p.set('status', k);
    return <Link key={k} className={`chip ${status === k ? 'on' : ''}`} href={`/bookings${p.toString() ? `?${p}` : ''}`}>{l}</Link>;
  };
  return (
    <>
      <div className="cp">
        <div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Bookings</h1></div>
        <div className="cp-actions"><Link className="btn primary" href="/bookings/new">New booking</Link></div>
        <div className="cp-tools">
          <SearchBox placeholder="Search file, customer, destination or traveller" />
          <div className="chips" role="group" aria-label="Filter by status">{chip('all', 'All')}{BOOKING_STATES.map(([k, l]) => chip(k, l))}</div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty">{q || status !== 'all' ? 'No bookings match this search or filter.' : 'No bookings yet. Use New booking, or convert an opportunity in the CRM.'}</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>File</th><th>Customer</th><th>Channel</th><th>Route</th><th>Destination</th><th>Dates</th><th>Status</th><th className="num">Total</th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td><Link href={`/bookings/${b.id}`}><strong>{b.ref}</strong></Link></td>
                  <td>{b.contactName}</td>
                  <td>{CHANNEL[b.contactType || 'customer']}</td>
                  <td>{b.tripType === 'service' ? <span className="muted">Service only</span> : `${b.origin || '—'} to ${b.destination || '—'}${b.tripType === 'oneway' ? ', one way' : ''}`}</td>
                  <td>{b.destinationName}</td>
                  <td>{travelDates(b)}</td>
                  <td><span className={`badge ${BOOK_BADGE[b.status]}`}>{label(BOOKING_STATES, b.status)}</span></td>
                  <td className="num">{money(totals(b.lines).total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
