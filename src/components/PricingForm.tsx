'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import type { Channel, MarkupType, Pricing } from '@/lib/constants';
import { useToast } from './Toast';

const CHANNELS: [Channel, string][] = [['B2C', 'Individuals (B2C)'], ['B2B', 'B2B agencies'], ['Corporate', 'Corporate']];

export function PricingForm({ initial, canEdit }: { initial: Pricing; canEdit: boolean }) {
  const [p, setP] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const dirty = JSON.stringify(p) !== JSON.stringify(saved);
  async function save() {
    setBusy(true);
    try { const r = await api<Pricing>('/api/settings/pricing', 'PUT', p); setP(r); setSaved(r); toast('Markup rules saved.'); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  return (
    <section className="sheet" style={{ marginBottom: 16 }}>
      <h2>Markup rules by channel</h2>
      <div className="grid">
        {CHANNELS.map(([k, l]) => (
          <div className="fld" key={k}>
            <label htmlFor={`pr-${k}`}>{l}</label>
            <span className="mk">
              <input id={`pr-${k}`} type="number" min={0} step={p.modes[k] === 'amount' ? '0.01' : '0.5'} value={p[k]} disabled={!canEdit}
                onChange={(e) => setP({ ...p, [k]: parseFloat(e.target.value) || 0 })} />
              <select aria-label={`${l} markup type`} value={p.modes[k]} disabled={!canEdit}
                onChange={(e) => setP({ ...p, modes: { ...p.modes, [k]: e.target.value as MarkupType } })}>
                <option value="percent">% of cost</option><option value="amount">USD per service</option>
              </select>
            </span>
          </div>
        ))}
      </div>
      {canEdit && <div className="addrow"><button className="btn primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</button>{dirty && <button className="btn" onClick={() => setP(saved)}>Discard</button>}</div>}
      <p className="hint">New services on a booking get the default of the customer’s channel: a percentage of the cost, or a fixed amount in USD added to each service. On each service you can still switch between % and USD and change the figure.</p>
    </section>
  );
}
