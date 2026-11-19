'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { LAYOUT_KINDS, type DocKind, type DocLayout } from '@/lib/constants';
import type { Company } from '@/lib/types';
import { PaperHead, PaperFoot, paperStyle } from '@/lib/paper';
import { useToast } from './Toast';

type Branding = { logo: string; docs: Record<DocKind, DocLayout> };
const SAMPLE = { id: 'x', name: 'Mansour Engineering SAL', type: 'corporate' as const, email: 'travel@mansour.example', phone: '+961 1 998 300', city: 'Beirut', country: 'Lebanon', creditLimit: 0, marketing: 'yes' as const, portalAccess: 'no' as const, notes: '' };
const SWATCHES = ['#0E6B6B', '#1F5FA8', '#2E6B3A', '#7A3E7E', '#B4532A', '#3E4A55', '#A63434', '#15212B'];

/** Shrinks a logo in the browser to at most 600 px wide, so it stays small enough to keep with the settings. */
async function shrinkLogo(f: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) throw new Error('Use a PNG, JPG or WebP image. SVG isn’t accepted.');
  const bmp = await createImageBitmap(f);
  const scale = Math.min(1, 600 / bmp.width, 240 / bmp.height);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  // PNG keeps transparent backgrounds; fall back to JPEG if the PNG is large.
  let url = c.toDataURL('image/png');
  if (url.length > 350_000) url = c.toDataURL('image/jpeg', 0.85);
  if (url.length > 390_000) throw new Error('That logo is still too large after shrinking. Try a simpler image.');
  return url;
}

export function DocumentLayouts({ initial, company }: { initial: Branding; company: Company }) {
  const [b, setB] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [kind, setKind] = useState<DocKind>('invoice');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const L = b.docs[kind];
  const dirty = JSON.stringify(b) !== JSON.stringify(saved);
  const set = <K extends keyof DocLayout>(k: K, v: DocLayout[K]) => setB({ ...b, docs: { ...b.docs, [kind]: { ...L, [k]: v } } });
  async function save() {
    setBusy(true);
    try { const r = await api<Branding>('/api/settings/branding', 'PUT', b); setB(r); setSaved(r); toast('Document layouts saved. New prints use them straight away.'); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function pickLogo(f?: File) {
    if (!f) return;
    try { setB({ ...b, logo: await shrinkLogo(f) }); } catch (e) { toast((e as Error).message, 'err'); }
  }
  const layout = { ...L, logo: b.logo };
  return (
    <section className="sheet" style={{ marginBottom: 16 }} id="documents">
      <div className="cp" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Documents</h2>
        <div className="cp-actions">{dirty && <span className="dirty">Unsaved changes</span>}<button className="btn primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save layouts'}</button></div></div>
      <div className="addrow" style={{ marginTop: 0, alignItems: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {b.logo ? <img src={b.logo} alt="Company logo" style={{ maxHeight: 48, maxWidth: 180, objectFit: 'contain', background: '#fff', borderRadius: 6, padding: 4, border: '1px solid var(--line)' }} /> : <span className="muted">No logo yet.</span>}
        <label className="btn" htmlFor="logo-in">{b.logo ? 'Replace logo' : 'Upload logo'}</label>
        <input id="logo-in" type="file" accept="image/png,image/jpeg,image/webp" className="sr" onChange={(e) => pickLogo(e.target.files?.[0])} />
        {b.logo && <button className="btn ghost" onClick={() => setB({ ...b, logo: '' })}>Remove logo</button>}
        <span className="hint" style={{ margin: 0 }}>PNG with a transparent background works best. Used on documents, emails and the portal.</span>
      </div>
      <div className="chips" style={{ margin: '12px 0' }}>{LAYOUT_KINDS.map(([k, l]) => <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{l}</button>)}</div>
      <div className="cmp">
        <div>
          <div className="grid">
            <label className="fld" htmlFor="dl-t"><span>Title on the document</span><input id="dl-t" value={L.title} onChange={(e) => set('title', e.target.value)} /></label>
            <div className="fld"><span>Accent colour</span>
              <div className="chips">{SWATCHES.map((c) => <button key={c} className={`swatch ${L.accent.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={L.accent.toLowerCase() === c.toLowerCase()} onClick={() => set('accent', c)} />)}
                <input type="color" aria-label="Custom colour" value={L.accent} onChange={(e) => set('accent', e.target.value)} style={{ width: 34, height: 30, padding: 0, border: 0, background: 'none' }} /></div></div>
          </div>
          <div className="chips" style={{ margin: '10px 0' }}>
            <label className="tgl"><input type="checkbox" checked={L.showLogo} onChange={(e) => set('showLogo', e.target.checked)} /> Logo</label>
            <label className="tgl"><input type="checkbox" checked={L.showTax} onChange={(e) => set('showTax', e.target.checked)} /> Financial and VAT numbers</label>
            <label className="tgl"><input type="checkbox" checked={L.showSigs} onChange={(e) => set('showSigs', e.target.checked)} /> Signature boxes</label>
          </div>
          {L.showSigs && <div className="grid">
            <label className="fld" htmlFor="dl-s1"><span>Left signature</span><input id="dl-s1" value={L.sig1} onChange={(e) => set('sig1', e.target.value)} /></label>
            <label className="fld" htmlFor="dl-s2"><span>Right signature</span><input id="dl-s2" value={L.sig2} onChange={(e) => set('sig2', e.target.value)} /></label>
          </div>}
          <div className="grid">
            <label className="fld wide" htmlFor="dl-n"><span>Footer note</span><textarea id="dl-n" rows={2} value={L.note} onChange={(e) => set('note', e.target.value)} /></label>
            <label className="fld wide" htmlFor="dl-tc"><span>Terms and conditions (optional)</span><textarea id="dl-tc" rows={5} value={L.terms} onChange={(e) => set('terms', e.target.value)} placeholder="Cancellation policy, payment terms, liability…" /></label>
          </div>
          <p className="hint">Prices on booking confirmations still follow the Show prices switch, and hotel vouchers never show prices. Company details come from the company section above.</p>
        </div>
        <div className="tplprev printpage inline">
          <article className="paper" style={paperStyle(layout)}>
            <PaperHead company={company} layout={layout} title={L.title} number={kind === 'invoice' ? 'INV/2026/0001' : 'SAMPLE'} party={SAMPLE} partyLabel={kind === 'po' || kind === 'voucher' || kind === 'supstatement' ? 'Supplier' : 'Customer'} meta={[['Date', '18 Nov 2026'], ['Booking', 'BK-0001']]} />
            <table><thead><tr><th>Description</th><th className="r">Amount</th></tr></thead><tbody><tr><td>Flight: Beirut to Dubai, 3 passengers</td><td className="r">$1,188.00</td></tr><tr><td>Hotel: 3 rooms, 3 nights</td><td className="r">$1,500.00</td></tr></tbody></table>
            <PaperFoot company={company} layout={layout} />
          </article>
        </div>
      </div>
    </section>
  );
}
