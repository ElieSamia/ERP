'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { fmtDate, money } from '@/lib/constants';
import type { Audience, AudienceFilter, Member } from '@/lib/marketing';
import { useToast } from './Toast';

type Preview = { total: number; reachable: number; noEmail: number; unsubscribed: number; members: Member[] };
const TYPES: [string, string][] = [['customer', 'Individual customers'], ['agency', 'Agencies'], ['corporate', 'Corporate accounts']];

export function AudienceEditor({ initial, empty }: { initial?: Audience; empty: AudienceFilter }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [desc, setDesc] = useState(initial?.desc ?? '');
  const [f, setF] = useState<AudienceFilter>(initial?.filter ?? empty);
  const [p, setP] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const set = <K extends keyof AudienceFilter>(k: K, v: AudienceFilter[K]) => setF({ ...f, [k]: v });
  useEffect(() => {
    clearTimeout(timer.current);
    if (!f.types.length) { setP(null); return; }
    timer.current = setTimeout(() => { api<Preview>('/api/marketing/audiences/preview', 'POST', { filter: f }).then(setP).catch(() => null); }, 300);
    return () => clearTimeout(timer.current);
  }, [f]);
  async function save() {
    setBusy(true);
    try {
      if (initial) { await api(`/api/marketing/audiences/${initial.id}`, 'PATCH', { name, desc, filter: f }); toast('Audience saved.'); router.refresh(); }
      else { await api('/api/marketing/audiences', 'POST', { name, desc, filter: f }); toast('Audience saved.'); router.push('/marketing?tab=audiences'); router.refresh(); }
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!initial || !window.confirm(`Delete the audience “${initial.name}”? Contacts aren’t affected.`)) return;
    try { await api(`/api/marketing/audiences/${initial.id}`, 'DELETE'); router.push('/marketing?tab=audiences'); router.refresh(); } catch (e) { toast((e as Error).message, 'err'); }
  }
  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href="/marketing?tab=audiences">Audiences</Link><span className="sep">/</span><span>{initial ? initial.name : 'New audience'}</span></div>
        <div className="cp-actions"><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save audience'}</button>{initial && <button className="btn ghost" onClick={remove}>Delete</button>}</div>
      </div>
      <div className="cmp">
        <section className="sheet">
          <div className="grid">
            <label className="fld wide" htmlFor="a-n"><span>Name</span><input id="a-n" value={name} onChange={(e) => setName(e.target.value)} placeholder="Agencies in Lebanon" /></label>
            <label className="fld wide" htmlFor="a-d"><span>Description (optional)</span><input id="a-d" value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
          </div>
          <h3 className="sub3">Who’s in it</h3>
          <fieldset className="fld wide" style={{ border: 0, padding: 0, margin: '0 0 10px' }}><legend><span>Type of contact</span></legend>
            <div className="chips">{TYPES.map(([k, l]) => <label key={k} className={`chip ${f.types.includes(k) ? 'on' : ''}`}><input type="checkbox" className="sr" checked={f.types.includes(k)} onChange={(e) => set('types', e.target.checked ? [...f.types, k] : f.types.filter((t) => t !== k))} />{l}</label>)}</div>
          </fieldset>
          <div className="grid">
            <label className="fld" htmlFor="a-co"><span>Country contains</span><input id="a-co" value={f.country} onChange={(e) => set('country', e.target.value)} placeholder="Lebanon" /></label>
            <label className="fld" htmlFor="a-ci"><span>City contains</span><input id="a-ci" value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="Beirut" /></label>
            <label className="fld" htmlFor="a-de"><span>Has travelled to</span><input id="a-de" value={f.destination} onChange={(e) => set('destination', e.target.value)} placeholder="Dubai" /></label>
            <label className="fld" htmlFor="a-sp"><span>Spent at least (USD)</span><input id="a-sp" type="number" min={0} value={f.minSpent || ''} onChange={(e) => set('minSpent', Number(e.target.value) || 0)} /></label>
            <label className="fld" htmlFor="a-bk"><span>Bookings</span>
              <select id="a-bk" value={f.booked} onChange={(e) => set('booked', e.target.value as AudienceFilter['booked'])}><option value="">Any</option><option value="within">Booked within the last…</option><option value="not-within">No booking in the last…</option></select></label>
            {f.booked && <label className="fld" htmlFor="a-mo"><span>Months</span><input id="a-mo" type="number" min={1} max={120} value={f.months} onChange={(e) => set('months', Math.max(1, Number(e.target.value) || 12))} /></label>}
            <label className="fld" htmlFor="a-po"><span>Portal access</span>
              <select id="a-po" value={f.portal} onChange={(e) => set('portal', e.target.value as AudienceFilter['portal'])}><option value="">Any</option><option value="yes">Has portal access</option><option value="no">No portal access</option></select></label>
          </div>
          <p className="hint">Audiences are recalculated each time you use them, so new contacts and bookings are included automatically. Suppliers are never included. Spending counts confirmed bookings.</p>
        </section>
        <section className="sheet">
          <h2>Matches now</h2>
          {!p ? <p className="muted">{f.types.length ? 'Counting…' : 'Choose at least one type of contact.'}</p> : (
            <>
              <div className="kpis">
                <div className="kpi"><span>Will receive campaigns</span><b>{p.reachable}</b></div>
                <div className="kpi"><span>Unsubscribed</span><b>{p.unsubscribed}</b></div>
                <div className="kpi"><span>No email address</span><b>{p.noEmail}</b></div>
              </div>
              <div className="table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}><table className="lines">
                <thead><tr><th>Contact</th><th>Email</th><th className="num">Spent</th><th>Last booking</th></tr></thead>
                <tbody>{p.members.map((m) => (
                  <tr key={m.id}><td><Link href={`/contacts/${m.id}`}>{m.name}</Link></td>
                    <td>{m.email ? (m.marketing === 'no' ? <span className="muted">{m.email} (unsubscribed)</span> : m.email) : <span className="muted">No email</span>}</td>
                    <td className="num">{m.spent ? money(m.spent) : ''}</td><td>{m.lastBooking ? fmtDate(m.lastBooking) : ''}</td></tr>))}
                  {p.members.length === 0 && <tr><td colSpan={4} className="muted">Nobody matches these filters.</td></tr>}
                </tbody></table></div>
              {p.total > p.members.length && <p className="hint">Showing the first {p.members.length} of {p.total}.</p>}
            </>
          )}
        </section>
      </div>
    </>
  );
}
