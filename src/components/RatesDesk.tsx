'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { CHANNEL, fmtDate, money, sell, type Pricing } from '@/lib/constants';
import type { Result } from '@/lib/rates';
import type { RateKind } from '@/lib/rates/types';
import { Modal } from './Modal';
import { useToast } from './Toast';

type Opt = { id: string; name: string; type: string };
type Target = { id: string; label: string; contactId: string };
const KINDS: [RateKind, string][] = [['flight', 'Flights'], ['hotel', 'Hotels'], ['transfer', 'Transfers'], ['insurance', 'Insurance']];
const plus = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const START: Record<RateKind, Record<string, string | number>> = {
  flight: { origin: 'BEY', destination: '', depart: plus(14), ret: plus(21), adults: 1, children: 0, cabin: 'economy' },
  hotel: { destination: '', checkIn: plus(14), checkOut: plus(17), rooms: 1, adults: 2, children: 0 },
  transfer: { from: '', to: '', date: plus(14), time: '12:00', passengers: 2 },
  insurance: { destination: '', start: plus(14), end: plus(21), travellers: 1 },
};

export function RatesDesk({ customers, pricing, drafts, requests, hasConnections }: { customers: Opt[]; pricing: Pricing; drafts: Target[]; requests: Target[]; hasConnections: boolean }) {
  const [kind, setKind] = useState<RateKind>('flight');
  const [forms, setForms] = useState(START);
  const [customer, setCustomer] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [errors, setErrors] = useState<{ provider: string; error: string }[]>([]);
  const [picked, setPicked] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [send, setSend] = useState<null | 'new' | 'booking' | 'request'>(null);
  const [target, setTarget] = useState('');
  const [filter, setFilter] = useState<'all' | 'refundable'>('all');
  const toast = useToast();
  const router = useRouter();
  const f = forms[kind];
  const set = (k: string, v: string | number) => setForms({ ...forms, [kind]: { ...f, [k]: v } });
  const cust = customers.find((c) => c.id === customer);
  const ch = CHANNEL[cust?.type ?? 'customer'] ?? 'B2C';
  const price = (r: Result) => sell({ cost: r.costUSD, markup: pricing[ch], markupType: pricing.modes?.[ch] ?? 'percent' });
  const shown = useMemo(() => (results ?? []).filter((r) => filter === 'all' || r.refundable), [results, filter]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setResults(null); setErrors([]);
    try { const r = await api<{ results: Result[]; errors: { provider: string; error: string }[] }>('/api/rates/search', 'POST', { kind, q: f }); setResults(r.results); setErrors(r.errors); }
    catch (x) { toast((x as Error).message, 'err'); } finally { setBusy(false); }
  }
  const toggle = (r: Result) => setPicked(picked.some((p) => p.token === r.token) ? picked.filter((p) => p.token !== r.token) : [...picked, r]);
  async function go() {
    if (!send) return;
    const body = send === 'new' ? { type: 'new', contactId: customer } : send === 'booking' ? { type: 'booking', bookingId: target } : { type: 'request', requestId: target, validDays: 7 };
    setBusy(true);
    try {
      const r = await api<{ bookingId?: string; requestId?: string; amount?: number }>('/api/rates/add', 'POST', { tokens: picked.map((p) => p.token), target: body });
      setPicked([]); setSend(null);
      if (r.bookingId) { toast('Added to the booking. Add travellers, then reserve each service with its provider.'); router.push(`/bookings/${r.bookingId}`); }
      else { toast(`Quote of ${money(r.amount ?? 0)} sent to the customer.`); router.push(`/b2b/requests/${r.requestId}`); }
    } catch (x) { toast((x as Error).message, 'err'); } finally { setBusy(false); }
  }

  const fld = (k: string, label: string, type = 'text', extra: Record<string, unknown> = {}) => (
    <label className="fld" htmlFor={`rq-${k}`}><span>{label}</span><input id={`rq-${k}`} type={type} value={String(f[k] ?? '')} onChange={(e) => set(k, type === 'number' ? Number(e.target.value) : e.target.value)} {...extra} /></label>
  );
  const total = picked.reduce((s, r) => s + price(r), 0);
  const bookingsFor = drafts.filter((b) => !customer || b.contactId === customer);
  const requestsFor = requests.filter((q) => !customer || q.contactId === customer);
  return (
    <>
      {!hasConnections && <p className="banner">No provider is connected yet. An administrator can add the <b>Demo provider</b> under Connections to try the desk with sample results.</p>}
      <div className="chips" style={{ marginBottom: 12 }}>{KINDS.map(([k, l]) => <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => { setKind(k); setResults(null); }}>{l}</button>)}</div>
      <form className="sheet" onSubmit={search} style={{ marginBottom: 16 }}>
        <div className="grid g4">
          {kind === 'flight' && <>{fld('origin', 'From (airport)', 'text', { maxLength: 3, placeholder: 'BEY' })}{fld('destination', 'To (airport)', 'text', { maxLength: 3, placeholder: 'DXB' })}{fld('depart', 'Depart', 'date')}{fld('ret', 'Return (empty for one way)', 'date')}
            {fld('adults', 'Adults', 'number', { min: 1, max: 9 })}{fld('children', 'Children', 'number', { min: 0, max: 9 })}
            <label className="fld" htmlFor="rq-cabin"><span>Cabin</span><select id="rq-cabin" value={String(f.cabin)} onChange={(e) => set('cabin', e.target.value)}><option value="economy">Economy</option><option value="business">Business</option></select></label></>}
          {kind === 'hotel' && <>{fld('destination', 'City or hotel area', 'text', { placeholder: 'Dubai' })}{fld('checkIn', 'Check-in', 'date')}{fld('checkOut', 'Check-out', 'date')}{fld('rooms', 'Rooms', 'number', { min: 1, max: 9 })}{fld('adults', 'Adults', 'number', { min: 1 })}{fld('children', 'Children', 'number', { min: 0 })}</>}
          {kind === 'transfer' && <>{fld('from', 'From', 'text', { placeholder: 'DXB airport' })}{fld('to', 'To', 'text', { placeholder: 'Marina hotel' })}{fld('date', 'Date', 'date')}{fld('time', 'Time', 'time')}{fld('passengers', 'Passengers', 'number', { min: 1 })}</>}
          {kind === 'insurance' && <>{fld('destination', 'Destination', 'text', { placeholder: 'Schengen' })}{fld('start', 'From', 'date')}{fld('end', 'To', 'date')}{fld('travellers', 'Travellers', 'number', { min: 1 })}</>}
          <label className="fld" htmlFor="rq-cust"><span>Price for</span><select id="rq-cust" value={customer} onChange={(e) => setCustomer(e.target.value)}><option value="">Any customer (B2C prices)</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        </div>
        <div className="addrow"><button className="btn primary" disabled={busy || !hasConnections}>{busy && !send ? 'Searching all providers…' : 'Search'}</button>
          <span className="hint" style={{ margin: 0, alignSelf: 'center' }}>Searches every connected provider at once. Prices shown include your {ch} markup.</span></div>
      </form>
      {errors.map((e) => <p key={e.provider} className="form-error">{e.error}</p>)}
      {results && (
        <section className="sheet">
          <div className="cp" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>{shown.length} option{shown.length === 1 ? '' : 's'}</h2>
            <div className="chips">{(['all', 'refundable'] as const).map((k) => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{k === 'all' ? 'All' : 'Refundable only'}</button>)}</div></div>
          {shown.length === 0 ? <p className="muted">No options for this search.</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th><span className="sr">Select</span></th><th>Option</th><th>Conditions</th><th>Provider</th><th className="num">Cost</th><th className="num">Your price</th></tr></thead>
              <tbody>{shown.map((r) => { const on = picked.some((p) => p.token === r.token); return (
                <tr key={r.token} className={on ? 'picked' : ''}>
                  <td><input type="checkbox" aria-label={`Select ${r.title}`} checked={on} onChange={() => toggle(r)} /></td>
                  <td><strong>{r.title}</strong>{r.lines.map((x) => <span key={x} className="muted" style={{ display: 'block', fontSize: 13 }}>{x}</span>)}
                    {r.tags?.length ? <span style={{ display: 'block', marginTop: 3 }}>{r.tags.map((t) => <span key={t} className="badge" style={{ marginRight: 4 }}>{t}</span>)}</span> : null}</td>
                  <td style={{ fontSize: 13 }}>{r.refundable ? <span className="badge b-green">Refundable</span> : <span className="badge b-amber">Non-refundable</span>}
                    {r.cancelDeadline && <span className="muted" style={{ display: 'block' }}>Free cancellation until {fmtDate(r.cancelDeadline)}</span>}
                    {r.timeLimit && <span className="muted" style={{ display: 'block' }}>Ticket by {fmtDate(r.timeLimit)}</span>}</td>
                  <td>{r.provider}</td>
                  <td className="num">{money(r.costUSD)}{r.currency !== 'USD' && <span className="muted" style={{ display: 'block', fontSize: 12 }}>{r.amount.toFixed(2)} {r.currency}</span>}</td>
                  <td className="num"><b>{money(price(r))}</b></td>
                </tr>); })}</tbody>
            </table></div>
          )}
        </section>
      )}
      {picked.length > 0 && (
        <div className="tray" role="region" aria-label="Selected options">
          <span><b>{picked.length}</b> selected, <b>{money(total)}</b>{cust ? ` for ${cust.name}` : ''}</span>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={() => setPicked([])}>Clear</button>
          <button className="btn" onClick={() => { setSend('request'); setTarget(requestsFor[0]?.id ?? ''); }}>Quote a portal request…</button>
          <button className="btn" onClick={() => { setSend('booking'); setTarget(bookingsFor[0]?.id ?? ''); }}>Add to a draft booking…</button>
          <button className="btn primary" onClick={() => setSend('new')}>New booking…</button>
        </div>
      )}
      {send && (
        <Modal title={send === 'new' ? 'New booking' : send === 'booking' ? 'Add to a draft booking' : 'Quote a portal request'} onClose={() => setSend(null)}>
          {send === 'new' && <label className="fld" htmlFor="tg-c"><span>Customer</span><select id="tg-c" value={customer} onChange={(e) => setCustomer(e.target.value)}><option value="">Choose…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
          {send === 'booking' && (bookingsFor.length ? <label className="fld" htmlFor="tg-b"><span>Draft booking</span><select id="tg-b" value={target} onChange={(e) => setTarget(e.target.value)}>{bookingsFor.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
            : <p className="muted">No draft bookings{cust ? ` for ${cust.name}` : ''}. Use New booking instead.</p>)}
          {send === 'request' && (requestsFor.length ? <label className="fld" htmlFor="tg-r"><span>Portal request</span><select id="tg-r" value={target} onChange={(e) => setTarget(e.target.value)}>{requestsFor.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}</select></label>
            : <p className="muted">No open portal requests{cust ? ` from ${cust.name}` : ''}.</p>)}
          <p className="hint">{send === 'request' ? 'The customer gets the quote in the portal (valid 7 days). If they accept, the booking is created with exactly these services.' : 'Services get the customer’s channel markup, editable on the booking. Nothing is reserved yet: do that from the booking once the travellers are entered.'}</p>
          <div className="dlg-actions">
            <button className="btn" onClick={() => setSend(null)}>Cancel</button>
            <button className="btn primary" onClick={go} disabled={busy || (send === 'new' ? !customer : !target)}>{busy ? 'Working…' : send === 'request' ? 'Send quote' : 'Add services'}</button>
          </div>
        </Modal>
      )}
      <p className="hint">Results are kept for 3 hours. Search again for fresh prices before adding older ones. <Link href="/bookings">Bookings</Link></p>
    </>
  );
}
