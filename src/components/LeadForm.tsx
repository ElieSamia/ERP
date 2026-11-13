'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { LEAD_STAGES } from '@/lib/constants';
import type { Lead } from '@/lib/types';
import { TextField, NumberField, SelectField, TextArea } from './Fields';
import { CustomerPicker } from './CustomerPicker';
import { ActivityPanel } from './ActivityPanel';
import { useToast } from './Toast';

type Draft = Omit<Lead, 'id'>;
const EMPTY: Draft = { title: '', contactId: '', contactName: '', stage: 'new', destination: '', travelDate: '', pax: 1, budget: 0, notes: '' };

export function LeadForm({ initial }: { initial?: Lead }) {
  const router = useRouter();
  const toast = useToast();
  const [saved, setSaved] = useState<Draft>(initial ?? EMPTY);
  const [l, setL] = useState<Draft>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const dirty = JSON.stringify(l) !== JSON.stringify(saved);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setL({ ...l, [k]: v });
  const payload = () => ({ title: l.title, contactId: l.contactId, stage: l.stage, destination: l.destination, travelDate: l.travelDate, pax: l.pax, budget: l.budget, notes: l.notes });

  async function save() {
    setBusy(true);
    try {
      if (initial) {
        const r = await api<Lead>(`/api/leads/${initial.id}`, 'PATCH', payload());
        setSaved(r); setL(r); setTick((t) => t + 1); toast('Opportunity saved.'); router.refresh();
      } else {
        const r = await api<Lead>('/api/leads', 'POST', payload());
        toast('Opportunity saved.'); router.push(`/crm/${r.id}`); router.refresh();
      }
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function setStage(stage: Draft['stage']) {
    if (!initial) return set('stage', stage);
    try {
      const r = await api<Lead>(`/api/leads/${initial.id}`, 'PATCH', { stage });
      setSaved({ ...saved, stage: r.stage }); setL({ ...l, stage: r.stage }); setTick((t) => t + 1); router.refresh();
      toast(stage === 'lost' ? 'Marked as lost.' : 'Stage updated.');
    } catch (e) { toast((e as Error).message, 'err'); }
  }
  async function convert() {
    if (!initial) return;
    if (dirty) return toast('Save your changes first.', 'err');
    try {
      const b = await api<{ id: string; ref: string }>(`/api/leads/${initial.id}/convert`, 'POST');
      toast(`Booking ${b.ref} created.`); router.push(`/bookings/${b.id}`); router.refresh();
    } catch (e) { toast((e as Error).message, 'err'); }
  }
  async function remove() {
    if (!initial || !window.confirm('Delete this opportunity? This can’t be undone.')) return;
    try { await api(`/api/leads/${initial.id}`, 'DELETE'); toast('Opportunity deleted.'); router.push('/crm'); router.refresh(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }

  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href="/crm">CRM</Link><span className="sep">/</span><span>{initial ? saved.title : 'New opportunity'}</span></div>
        <div className="cp-actions">
          {dirty && <span className="dirty">Unsaved changes</span>}
          <button className="btn primary" onClick={save} disabled={busy || (!!initial && !dirty)}>{busy ? 'Saving…' : 'Save'}</button>
          {initial ? (dirty && <button className="btn" onClick={() => setL(saved)}>Discard</button>) : <Link className="btn" href="/crm">Cancel</Link>}
          {initial && initial.bookingId && <Link className="btn" href={`/bookings/${initial.bookingId}`}>Open booking {initial.bookingRef}</Link>}
          {initial && !initial.bookingId && saved.stage !== 'lost' && <button className="btn" onClick={convert}>Convert to booking</button>}
          {initial && saved.stage !== 'lost' && saved.stage !== 'won' && <button className="btn" onClick={() => setStage('lost')}>Mark as lost</button>}
          {initial && <button className="btn ghost" onClick={remove}>Delete</button>}
        </div>
        <div className="cp-tools">
          <ol className="statusbar" aria-label="Stage">
            {LEAD_STAGES.map(([k, lb]) => (
              <li key={k} className={k === l.stage ? 'on' : ''} aria-current={k === l.stage ? 'step' : undefined}>
                {initial && k !== l.stage ? <button className="stagebtn" onClick={() => setStage(k)}>{lb}</button> : lb}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="recpage">
        <div className="recmain">
          {initial?.requestId && <p className="banner">From the B2B portal. Moving this opportunity also updates the customer’s request: Qualified starts the review, Won creates the booking and Lost declines it. Send quotes from the <Link className="link" href={`/b2b/requests/${initial.requestId}`}>portal request</Link>.</p>}
          <section className="sheet">
            <div className="grid">
              <TextField id="f-title" label="Opportunity" wide value={l.title} onChange={(v) => set('title', v)} />
              <CustomerPicker value={l.contactId} name={l.contactName || ''} onChange={(id, name) => setL({ ...l, contactId: id, contactName: name })} disabled={!!initial?.requestId} />
              {!initial && <SelectField id="f-stage" label="Stage" value={l.stage} options={LEAD_STAGES} onChange={(v) => set('stage', v as Draft['stage'])} />}
              <TextField id="f-dest" label="Destination" value={l.destination} onChange={(v) => set('destination', v)} />
              <TextField id="f-date" label="Travel date" type="date" value={l.travelDate} onChange={(v) => set('travelDate', v)} />
              <NumberField id="f-pax" label="Travellers" value={l.pax} onChange={(v) => set('pax', Math.round(v))} />
              <NumberField id="f-budget" label="Budget (USD)" step="0.01" value={l.budget} onChange={(v) => set('budget', v)} />
              <TextArea id="f-notes" label="Notes" rows={4} value={l.notes} onChange={(v) => set('notes', v)} />
            </div>
          </section>
        </div>
        {initial ? <ActivityPanel model="lead" id={initial.id} refreshKey={tick} /> :
          <aside className="chatter"><h3>Activity</h3><p className="muted" style={{ margin: 0 }}>Nothing is saved until you select Save. The activity log starts then.</p></aside>}
      </div>
    </>
  );
}
