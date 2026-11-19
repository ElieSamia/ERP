'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { PRESETS, type Appearance } from '@/lib/constants';
import { useToast } from './Toast';

export function AppearanceSettings({ initial }: { initial: Appearance }) {
  const [a, setA] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const dirty = JSON.stringify(a) !== JSON.stringify(saved);
  const set = <K extends keyof Appearance>(k: K, v: Appearance[K]) => setA({ ...a, [k]: v });
  async function save() {
    setBusy(true);
    try { const r = await api<Appearance>('/api/settings/appearance', 'PUT', a); setA(r); setSaved(r); toast('Appearance saved for everyone.'); router.refresh(); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  const radio = <K extends 'mode' | 'font' | 'density' | 'corners'>(k: K, opts: [Appearance[K], string][], label: string) => (
    <fieldset className="fld" style={{ border: 0, padding: 0, margin: 0 }}><legend><span>{label}</span></legend>
      <div className="chips">{opts.map(([v, l]) => <button key={v} className={`chip ${a[k] === v ? 'on' : ''}`} aria-pressed={a[k] === v} onClick={() => set(k, v)}>{l}</button>)}</div></fieldset>
  );
  return (
    <section className="sheet" style={{ marginBottom: 16 }} id="appearance">
      <div className="cp" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Appearance</h2>
        <div className="cp-actions">{dirty && <span className="dirty">Unsaved changes</span>}<button className="btn primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save appearance'}</button></div></div>
      <fieldset className="fld" style={{ border: 0, padding: 0, margin: '0 0 12px' }}><legend><span>Colours</span></legend>
        <div className="presets">{Object.entries(PRESETS).map(([k, p]) => (
          <button key={k} className={`preset ${a.preset === k ? 'on' : ''}`} aria-pressed={a.preset === k} onClick={() => set('preset', k)}>
            <span className="pv"><i style={{ background: p.light[2] }} /><i style={{ background: p.light[0] }} /><i style={{ background: p.light[1] }} /></span>{p.name}
          </button>))}</div></fieldset>
      <div className="grid">
        {radio('mode', [['system', 'Follow the device'], ['light', 'Light'], ['dark', 'Dark']], 'Light or dark')}
        {radio('font', [['instrument', 'Instrument Sans'], ['system', 'System font'], ['serif', 'Serif']], 'Font')}
        {radio('density', [['comfortable', 'Comfortable'], ['compact', 'Compact']], 'Spacing')}
        {radio('corners', [['rounded', 'Rounded'], ['square', 'Square']], 'Corners')}
      </div>
      <label className="tgl" style={{ marginTop: 10 }}><input type="checkbox" checked={a.showLogo} onChange={(e) => set('showLogo', e.target.checked)} /> Show the logo in the top bar and the portal</label>
      <p className="hint">Applies to everyone on your team and to the customer and supplier portal. Printed documents keep their own colours, set under Documents.</p>
    </section>
  );
}
