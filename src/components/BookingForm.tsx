'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import {
  BOOKING_STATES, CHANNEL, SERVICE_TYPES, TRIP_TYPES, fmtDate, label, money, sell, totals, travList, serviceDates, type Pricing,
} from '@/lib/constants';
import type { Booking, BookingLine, Option } from '@/lib/types';
import { TextField, SelectField, TextArea } from './Fields';
import { CustomerPicker } from './CustomerPicker';
import { ActivityPanel } from './ActivityPanel';
import { DocumentsPanel } from './DocumentsPanel';
import { Icon } from './Icon';
import { useToast } from './Toast';

type Draft = Omit<Booking, 'id' | 'ref' | 'status' | 'docs'>;
const today = () => new Date().toISOString().slice(0, 10);
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));
const EMPTY: Draft = {
  contactId: '', contactName: '', contactType: 'customer', tripType: 'return', bookingDate: today(), origin: 'BEY', destination: '',
  destinationName: '', departDate: '', returnDate: '', travellers: '', lines: [], tripNotes: '', notes: '',
};
const pick = (b: Booking): Draft => ({
  contactId: b.contactId, contactName: b.contactName, contactType: b.contactType, tripType: b.tripType, bookingDate: b.bookingDate,
  origin: b.origin, destination: b.destination, destinationName: b.destinationName, departDate: b.departDate, returnDate: b.returnDate,
  travellers: b.travellers, lines: b.lines, tripNotes: b.tripNotes, notes: b.notes,
});
const payload = (d: Draft) => {
  const { contactName, contactType, ...rest } = d;
  void contactName; void contactType;
  return rest;
};

function Ticket({ b, booking }: { b: Draft; booking?: Booking }) {
  const t = totals(b.lines);
  const travellers = travList(b.travellers).length;
  const route = b.tripType === 'service' ? (
    <div className="route"><div className="pt">
      <span className="code svc">{[...new Set(b.lines.map((l) => label(SERVICE_TYPES, l.type)))].join(' and ') || 'Service'}</span>
      <span className="sub">{[b.destinationName, serviceDates(b)].filter(Boolean).join(', ') || 'Dates are set on each service'}</span>
    </div></div>
  ) : (
    <div className="route">
      <div className="pt"><span className="code">{b.origin || '···'}</span><span className="sub">Departs {fmtDate(b.departDate)}</span></div>
      <div className="path"><Icon name="plane" size={20} /></div>
      <div className="pt" style={{ textAlign: 'right' }}><span className="code">{b.destination || '···'}</span>
        <span className="sub">{b.destinationName || 'Destination not set'}, {b.tripType === 'oneway' ? 'one way' : `returns ${fmtDate(b.returnDate)}`}</span></div>
    </div>
  );
  return (
    <section className="ticket" aria-label="Trip summary">
      {route}
      <div className="stub">
        <dl>
          <dt>File</dt><dd>{booking?.ref ?? 'New'}</dd>
          <dt>Booked</dt><dd>{fmtDate(b.bookingDate)}</dd>
          <dt>Customer</dt><dd>{b.contactName || 'Not set'}</dd>
          <dt>Channel</dt><dd>{CHANNEL[b.contactType || 'customer']}</dd>
          <dt>Travellers</dt><dd>{travellers}</dd>
        </dl>
        <div className="tt"><span className="muted">Total</span><b>{money(t.total)}</b></div>
      </div>
    </section>
  );
}

export function BookingForm({ initial, suppliers, pricing }: { initial?: Booking; suppliers: Option[]; pricing: Pricing }) {
  const router = useRouter();
  const toast = useToast();
  const [booking, setBooking] = useState<Booking | undefined>(initial);
  const [saved, setSaved] = useState<Draft>(initial ? pick(initial) : EMPTY);
  const [b, setB] = useState<Draft>(initial ? pick(initial) : EMPTY);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const status = booking?.status ?? 'draft';
  const dirty = JSON.stringify(b) !== JSON.stringify(saved);
  const linesEditable = status === 'draft' || status === 'confirmed';
  const headerEditable = status !== 'cancelled';
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setB({ ...b, [k]: v });
  const rate = pricing[CHANNEL[b.contactType || 'customer']];
  const t = totals(b.lines);
  const supplierOpts: [string, string][] = [['', 'None'], ...suppliers.map((s) => [s.id, s.name] as [string, string])];

  function applyResult(r: Booking) { setBooking(r); setSaved(pick(r)); setB(pick(r)); setTick((x) => x + 1); }
  function setLine(id: string, patch: Partial<BookingLine>) { set('lines', b.lines.map((l) => (l.id === id ? { ...l, ...patch } : l))); }
  function addLine() {
    const svc = b.tripType === 'service';
    set('lines', [...b.lines, { id: newId(), type: svc ? 'visa' : 'flight', desc: '', date: b.departDate || '', dateTo: '', supplierId: '', cost: 0, markup: rate }]);
  }
  function changeCustomer(id: string, name: string, type: string) {
    const newRate = pricing[CHANNEL[type] ?? 'B2C'];
    setB({ ...b, contactId: id, contactName: name, contactType: type as Draft['contactType'], lines: status === 'draft' ? b.lines.map((l) => ({ ...l, markup: newRate })) : b.lines });
  }

  async function save() {
    setBusy(true);
    try {
      if (booking) { applyResult(await api<Booking>(`/api/bookings/${booking.id}`, 'PATCH', payload(b))); toast('Booking saved.'); router.refresh(); }
      else { const r = await api<Booking>('/api/bookings', 'POST', payload(b)); toast(`Booking ${r.ref} created.`); router.push(`/bookings/${r.id}`); router.refresh(); }
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function act(action: 'confirm' | 'ticket' | 'cancel' | 'draft', msg: string) {
    if (!booking) return;
    if (dirty) return toast('Save your changes first.', 'err');
    if (action === 'cancel' && !window.confirm('Cancel this booking?')) return;
    try { applyResult(await api<Booking>(`/api/bookings/${booking.id}/status`, 'POST', { action })); toast(msg); router.refresh(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  async function remove() {
    if (!booking || !window.confirm(`Delete ${booking.ref}? Its documents are deleted too. This can’t be undone.`)) return;
    try { await api(`/api/bookings/${booking.id}`, 'DELETE'); toast('Booking deleted.'); router.push('/bookings'); router.refresh(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }

  const hasHotel = b.lines.some((l) => l.type === 'hotel' || l.type === 'package');
  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href="/bookings">Bookings</Link><span className="sep">/</span><span>{booking?.ref ?? 'New booking'}</span></div>
        <div className="cp-actions">
          {dirty && <span className="dirty">Unsaved changes</span>}
          <button className="btn primary" onClick={save} disabled={busy || (!!booking && !dirty)}>{busy ? 'Saving…' : 'Save'}</button>
          {booking ? (dirty && <button className="btn" onClick={() => setB(saved)}>Discard</button>) : <Link className="btn" href="/bookings">Cancel</Link>}
          {booking && status === 'draft' && <button className="btn" onClick={() => act('confirm', 'Booking confirmed.')}>Confirm booking</button>}
          {booking && status === 'confirmed' && <button className="btn" onClick={() => act('ticket', 'Marked as ticketed.')}>Mark as ticketed</button>}
          {booking && ['draft', 'confirmed', 'ticketed'].includes(status) && <button className="btn" onClick={() => act('cancel', 'Booking cancelled.')}>Cancel booking</button>}
          {booking && status === 'cancelled' && <button className="btn" onClick={() => act('draft', 'Reset to draft.')}>Reset to draft</button>}
          {booking && <a className="btn" href={`/print/booking/${booking.id}`} target="_blank" rel="noopener">Print confirmation</a>}
          {booking && hasHotel && <a className="btn" href={`/print/vouchers/${booking.id}`} target="_blank" rel="noopener">Hotel vouchers</a>}
          {booking && status === 'draft' && <button className="btn ghost" onClick={remove}>Delete</button>}
        </div>
        <div className="cp-tools">
          <ol className="statusbar" aria-label="Status">
            {BOOKING_STATES.filter(([k]) => k !== 'cancelled' || status === 'cancelled').map(([k, l]) => (
              <li key={k} className={`${k === status ? 'on' : ''} ${k === 'cancelled' ? 'cancel' : ''}`} aria-current={k === status ? 'step' : undefined}>{l}</li>
            ))}
          </ol>
        </div>
      </div>

      <div className="recpage">
        <div className="recmain">
          <Ticket b={b} booking={booking} />
          {booking?.leadId && <p className="linked">From opportunity <Link className="link" href={`/crm/${booking.leadId}`}>{booking.leadTitle || 'Open'}</Link></p>}

          <section className="sheet">
            <h2>Trip details</h2>
            <div className="grid">
              <CustomerPicker value={b.contactId} name={b.contactName || ''} onChange={changeCustomer} disabled={!!booking && status !== 'draft'} />
              <TextField id="f-bdate" label="Booking date" type="date" value={b.bookingDate} onChange={(v) => set('bookingDate', v)} disabled={!headerEditable} />
              <SelectField id="f-trip" label="Trip type" value={b.tripType} options={TRIP_TYPES} onChange={(v) => set('tripType', v as Draft['tripType'])} disabled={!headerEditable} />
              {b.tripType !== 'service' && <TextField id="f-dep" label="Departure" type="date" value={b.departDate} onChange={(v) => set('departDate', v)} disabled={!headerEditable} />}
              {b.tripType === 'return' && <TextField id="f-ret" label="Return" type="date" value={b.returnDate} onChange={(v) => set('returnDate', v)} disabled={!headerEditable} />}
              {b.tripType !== 'service' && <TextField id="f-from" label="From (airport code)" value={b.origin} onChange={(v) => set('origin', v.toUpperCase().slice(0, 3))} disabled={!headerEditable} />}
              {b.tripType !== 'service' && <TextField id="f-to" label="To (airport code)" value={b.destination} onChange={(v) => set('destination', v.toUpperCase().slice(0, 3))} disabled={!headerEditable} />}
              <TextField id="f-dname" label="Destination name" value={b.destinationName} onChange={(v) => set('destinationName', v)} disabled={!headerEditable} />
              <TextArea id="f-trav" label="Travellers, one per line, as in passports" rows={3} value={b.travellers} onChange={(v) => set('travellers', v)} disabled={!headerEditable} />
            </div>
          </section>

          <section className="sheet">
            <h2>Services</h2>
            {b.lines.length ? (
              <div className="table-wrap">
                <table className="lines">
                  <thead><tr><th>Type</th><th>Description</th><th>From</th><th>To</th><th>Supplier</th><th className="num">Cost</th><th className="num">Markup %</th><th className="num">Price</th>{linesEditable && <th><span className="sr">Remove</span></th>}</tr></thead>
                  <tbody>
                    {b.lines.map((l) => linesEditable ? (
                      <tr key={l.id}>
                        <td><select aria-label="Service type" value={l.type} onChange={(e) => setLine(l.id, { type: e.target.value as BookingLine['type'] })}>{SERVICE_TYPES.map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}</select></td>
                        <td><input className="w-desc" aria-label="Description" value={l.desc} onChange={(e) => setLine(l.id, { desc: e.target.value })} /></td>
                        <td><input type="date" aria-label="Service date" value={l.date} onChange={(e) => setLine(l.id, { date: e.target.value })} /></td>
                        <td><input type="date" aria-label="Service end date" value={l.dateTo} onChange={(e) => setLine(l.id, { dateTo: e.target.value })} /></td>
                        <td><select aria-label="Supplier" value={l.supplierId} onChange={(e) => setLine(l.id, { supplierId: e.target.value })}>{supplierOpts.map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}</select></td>
                        <td className="num"><input className="w-num" type="number" min={0} step="0.01" aria-label="Cost" value={l.cost} onChange={(e) => setLine(l.id, { cost: parseFloat(e.target.value) || 0 })} /></td>
                        <td className="num"><input className="w-pct" type="number" min={0} step="0.5" aria-label="Markup percent" value={l.markup} onChange={(e) => setLine(l.id, { markup: parseFloat(e.target.value) || 0 })} /></td>
                        <td className="num">{money(sell(l))}</td>
                        <td><button className="icon-btn" aria-label="Remove service" onClick={() => set('lines', b.lines.filter((x) => x.id !== l.id))}>×</button></td>
                      </tr>
                    ) : (
                      <tr key={l.id}>
                        <td>{label(SERVICE_TYPES, l.type)}</td><td>{l.desc}</td><td>{l.date ? fmtDate(l.date) : ''}</td><td>{l.dateTo ? fmtDate(l.dateTo) : ''}</td>
                        <td>{suppliers.find((s) => s.id === l.supplierId)?.name ?? ''}</td><td className="num">{money(l.cost)}</td><td className="num">{l.markup}%</td><td className="num">{money(sell(l))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="empty">No services yet. Add a flight, hotel or other service to price this trip.</div>}
            {linesEditable && <div className="addrow"><button className="btn" onClick={addLine}>Add service</button>
              <span className="muted" style={{ alignSelf: 'center', fontSize: 13.5 }}>New services get the {CHANNEL[b.contactType || 'customer']} markup of {rate}%.</span></div>}
            <div className="totals">
              <div><span>Supplier cost</span><b>{money(t.cost)}</b></div>
              <div><span>Margin</span><b>{money(t.margin)}</b></div>
              <div className="grand"><span>Total price</span><b>{money(t.total)}</b></div>
            </div>
          </section>

          <section className="sheet">
            <h2>Notes</h2>
            <div className="grid">
              <TextArea id="f-tnotes" label="Notes for the customer, printed on the confirmation" rows={5} value={b.tripNotes} onChange={(v) => set('tripNotes', v)} />
              <TextArea id="f-notes" label="Internal notes, staff only" rows={5} value={b.notes} onChange={(v) => set('notes', v)} />
            </div>
          </section>

          {booking ? <DocumentsPanel booking={booking} onChange={(r) => { setBooking(r); setTick((x) => x + 1); }} /> :
            <section className="sheet"><h2>Documents</h2><p className="muted" style={{ margin: 0 }}>Save the booking first, then attach tickets, vouchers and passports.</p></section>}
        </div>
        {booking ? <ActivityPanel model="booking" id={booking.id} refreshKey={tick} /> :
          <aside className="chatter"><h3>Activity</h3><p className="muted" style={{ margin: 0 }}>Nothing is saved until you select Save.</p></aside>}
      </div>
    </>
  );
}
