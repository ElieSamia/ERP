'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { fmtDate } from '@/lib/constants';
import type { PaxInput } from '@/lib/travellers';
import { Modal } from './Modal';
import { useToast } from './Toast';

/** What providers need for each traveller. Flights need all of it; hotels usually just the name. */
const complete = (p: PaxInput) => !!(p.title && p.givenName && p.familyName && p.gender && p.bornOn && p.email && p.phone);

export function TravellerDetails({ bookingId, travellers, dirty, initial }: { bookingId: string; travellers: string; dirty: boolean; initial: PaxInput[] }) {
  const [list, setList] = useState<PaxInput[] | null>(initial);
  const [loadedFor, setLoadedFor] = useState(travellers);
  const [ed, setEd] = useState<{ i: number; p: PaxInput } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  // Reload only when the saved names change (the server already sent the first list with the page).
  useEffect(() => { if (!dirty && travellers !== loadedFor) { setLoadedFor(travellers); api<PaxInput[]>(`/api/bookings/${bookingId}/travellers`).then(setList).catch(() => null); } }, [bookingId, travellers, dirty, loadedFor]);
  if (!list || list.length === 0) return null;
  async function save() {
    if (!ed || !list) return;
    setBusy(true);
    try {
      const next = list.map((p, i) => (i === ed.i ? ed.p : p));
      setList(await api<PaxInput[]>(`/api/bookings/${bookingId}/travellers`, 'PUT', next)); setEd(null); toast('Traveller details saved.');
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  const set = <K extends keyof PaxInput>(k: K, v: PaxInput[K]) => ed && setEd({ ...ed, p: { ...ed.p, [k]: v } });
  const fld = (k: keyof PaxInput, label: string, type = 'text', ph = '') => (
    <label className="fld" htmlFor={`px-${k}`}><span>{label}</span><input id={`px-${k}`} type={type} value={ed?.p[k] ?? ''} placeholder={ph} onChange={(e) => set(k, e.target.value as never)} /></label>
  );
  return (
    <section className="sheet">
      <h2>Traveller details</h2>
      <div className="table-wrap"><table className="lines">
        <thead><tr><th>Traveller</th><th>Date of birth</th><th>Passport</th><th>Contact</th><th><span className="sr">Edit</span></th></tr></thead>
        <tbody>{list.map((p, i) => (
          <tr key={p.name}><td><strong>{p.name}</strong>{complete(p) ? <span className="badge b-green" style={{ marginLeft: 6 }}>Ready for flights</span> : <span className="badge b-amber" style={{ marginLeft: 6 }}>Details missing</span>}</td>
            <td>{p.bornOn ? fmtDate(p.bornOn) : ''}</td>
            <td>{p.passportNumber ? <>{p.passportCountry} ••••{p.passportNumber.slice(-3)}<span className="muted" style={{ display: 'block', fontSize: 12.5 }}>expires {fmtDate(p.passportExpiry)}</span></> : <span className="muted">None</span>}</td>
            <td style={{ fontSize: 13 }}>{p.email}<span style={{ display: 'block' }}>{p.phone}</span></td>
            <td style={{ textAlign: 'right' }}><button className="btn" onClick={() => setEd({ i, p })}>Edit</button></td></tr>))}
        </tbody></table></div>
      <p className="hint">Airlines need title, names as in the passport, gender, date of birth, an email and a phone with country code for each traveller; many also need the passport. Passport numbers are stored encrypted and never shown in the customer portal.</p>
      {ed && (
        <Modal title={`Details for ${ed.p.name}`} onClose={() => setEd(null)}>
          <div className="grid">
            <label className="fld" htmlFor="px-title"><span>Title</span><select id="px-title" value={ed.p.title} onChange={(e) => set('title', e.target.value as PaxInput['title'])}><option value="">Choose…</option><option value="mr">Mr</option><option value="mrs">Mrs</option><option value="ms">Ms</option><option value="miss">Miss</option><option value="dr">Dr</option></select></label>
            <label className="fld" htmlFor="px-gender"><span>Gender (as in the passport)</span><select id="px-gender" value={ed.p.gender} onChange={(e) => set('gender', e.target.value as PaxInput['gender'])}><option value="">Choose…</option><option value="m">Male</option><option value="f">Female</option></select></label>
            {fld('givenName', 'First and middle names, as in the passport')}{fld('familyName', 'Last name, as in the passport')}
            {fld('bornOn', 'Date of birth', 'date')}{fld('nationality', 'Nationality (2 letters)', 'text', 'LB')}
            {fld('email', 'Email', 'email')}{fld('phone', 'Phone with country code', 'tel', '+96170123456')}
            {fld('passportNumber', 'Passport number')}{fld('passportCountry', 'Issued by (2 letters)', 'text', 'LB')}{fld('passportExpiry', 'Passport expiry', 'date')}
          </div>
          <div className="dlg-actions"><button className="btn" onClick={() => setEd(null)}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
        </Modal>
      )}
    </section>
  );
}
