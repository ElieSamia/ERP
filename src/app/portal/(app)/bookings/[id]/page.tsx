import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { canSeeBooking, getPortalCtx, portalDocs } from '@/lib/portal';
import { DOC_KINDS, PORTAL_STATUS, SERVICE_TYPES, fmtRange, label, money, sell, totals, travList, travelDates } from '@/lib/constants';

const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** A customer's view of one booking: no costs, suppliers or internal notes, only what they bought and their documents. */
export default async function PortalBooking({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPortalCtx();
  if (!ctx) redirect('/portal/login');
  const id = (await params).id;
  const b = await canSeeBooking(ctx, id);
  if (!b) notFound();
  const prices = ctx.perms.prices === 'yes';
  const [st, badge] = PORTAL_STATUS[b.status] ?? [b.status, ''];
  const docs = portalDocs(ctx, b.docs);
  const live = ['confirmed', 'ticketed', 'invoiced'].includes(b.status);
  const hotels = b.lines.some((l) => l.type === 'hotel' || l.type === 'package');
  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href="/portal/bookings">Bookings</Link><span className="sep">/</span><span>{b.ref}</span></div>
        <div className="cp-actions">
          {live && <Link className="btn" href={`/portal/print/confirm/${b.id}`} target="_blank">Print confirmation</Link>}
          {live && hotels && <Link className="btn" href={`/portal/print/vouchers/${b.id}`} target="_blank">Hotel vouchers</Link>}
        </div>
        <div className="cp-tools"><span className={`badge ${badge}`}>{st}</span></div>
      </div>
      {b.status === 'draft' && <p className="banner">Our team is preparing this booking. Services and documents appear here as they are confirmed.</p>}
      {b.status === 'cancelled' && <p className="banner">This booking was cancelled. Send us a message from a request if you have questions.</p>}
      <section className="sheet" style={{ marginBottom: 16 }}>
        <div className="grid">
          <div className="fld"><span>Destination</span><div className="ro">{b.destinationName || b.destination || 'Not set'}</div></div>
          <div className="fld"><span>Dates</span><div className="ro">{travelDates(b) || 'Not set'}</div></div>
          {b.tripType !== 'service' && <div className="fld"><span>Route</span><div className="ro">{b.origin || '?'} to {b.destination || '?'}{b.tripType === 'oneway' ? ', one way' : ''}</div></div>}
          <div className="fld"><span>Travellers</span><div className="ro">{travList(b.travellers).join(', ') || 'To be confirmed'}</div></div>
        </div>
      </section>
      <section className="sheet" style={{ marginBottom: 16 }}>
        <h2>Services</h2>
        {b.lines.length === 0 ? <p className="muted" style={{ margin: 0 }}>No services yet.</p> : (
          <div className="table-wrap"><table className="lines">
            <thead><tr><th>Service</th><th>Details</th><th>Dates</th>{prices && <th className="num">Price</th>}</tr></thead>
            <tbody>{b.lines.map((l) => <tr key={l.id}><td>{label(SERVICE_TYPES, l.type)}</td><td className="pre">{l.desc}</td><td>{fmtRange(l.date, l.dateTo)}</td>{prices && <td className="num">{money(sell(l))}</td>}</tr>)}</tbody>
            {prices && <tfoot><tr><td colSpan={3}><b>Total</b></td><td className="num"><b>{money(totals(b.lines).total)}</b></td></tr></tfoot>}
          </table></div>
        )}
        {b.tripNotes && <><h3 className="sub3">Important information</h3><p className="pre" style={{ margin: 0 }}>{b.tripNotes}</p></>}
      </section>
      <section className="sheet">
        <h2>Travel documents</h2>
        {docs.length === 0 ? <p className="muted" style={{ margin: 0 }}>No documents yet. Tickets, vouchers and visas appear here once they’re issued.</p> : (
          <div className="table-wrap"><table className="lines">
            <thead><tr><th>Type</th><th>For</th><th>File</th><th><span className="sr">Actions</span></th></tr></thead>
            <tbody>{docs.map((d) => (
              <tr key={d.id}><td>{label(DOC_KINDS, d.kind)}</td><td>{d.traveller || 'Whole booking'}</td><td>{d.name} <span className="muted">{fmtSize(d.size)}</span></td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <a className="btn" href={`/api/portal/files/booking/${b.id}/${d.id}`} target="_blank" rel="noopener">View</a>{' '}
                  <a className="btn" href={`/api/portal/files/booking/${b.id}/${d.id}?download=1`}>Download</a></td></tr>))}
            </tbody></table></div>
        )}
      </section>
    </>
  );
}
