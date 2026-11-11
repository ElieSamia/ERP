'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import type { Pricing } from '@/lib/constants';
import { NumberField } from './Fields';
import { useToast } from './Toast';

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
        <NumberField id="pr-b2c" label="Individuals (B2C) markup %" step="0.5" value={p.B2C} onChange={(v) => setP({ ...p, B2C: v })} disabled={!canEdit} />
        <NumberField id="pr-b2b" label="B2B agencies markup %" step="0.5" value={p.B2B} onChange={(v) => setP({ ...p, B2B: v })} disabled={!canEdit} />
        <NumberField id="pr-corp" label="Corporate markup %" step="0.5" value={p.Corporate} onChange={(v) => setP({ ...p, Corporate: v })} disabled={!canEdit} />
      </div>
      {canEdit && <div className="addrow"><button className="btn primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</button></div>}
      <p className="hint">New services on a booking get the markup of the customer’s channel. You can still change the markup on each service.</p>
    </section>
  );
}
