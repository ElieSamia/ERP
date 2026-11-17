'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { PRODUCT_PRICING, SERVICE_TYPES, fmtMarkup, money, productMarkup, sell, type Channel, type Pricing, type Product } from '@/lib/constants';
import type { Option } from '@/lib/types';
import { TextField, TextArea, SelectField, NumberField } from './Fields';
import { ActivityPanel } from './ActivityPanel';
import { useToast } from './Toast';

type Draft = Omit<Product, 'id' | 'supplierName' | 'used' | 'createdAt'>;
const pick = (p: Product): Draft => ({ code: p.code, name: p.name, type: p.type, desc: p.desc, supplierId: p.supplierId, cost: p.cost, pricing: p.pricing, markup: p.markup, vat: p.vat, active: p.active, notes: p.notes });
const EMPTY: Draft = { code: '', name: '', type: 'hotel', desc: '', supplierId: '', cost: 0, pricing: 'channel', markup: 0, vat: 'default', active: true, notes: '' };

export function ProductForm({ initial, suppliers, pricing, vatDefaults }: { initial?: Product; suppliers: Option[]; pricing: Pricing; vatDefaults: Record<string, number> }) {
  const router = useRouter();
  const toast = useToast();
  const [p, setP] = useState(initial);
  const [saved, setSaved] = useState(initial ? pick(initial) : EMPTY);
  const [f, setF] = useState(initial ? pick(initial) : EMPTY);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF({ ...f, [k]: v });

  async function save() {
    setBusy(true);
    try {
      if (p) { const r = await api<Product>(`/api/products/${p.id}`, 'PATCH', f); setP(r); setSaved(pick(r)); setF(pick(r)); setTick((x) => x + 1); toast('Product saved.'); router.refresh(); }
      else { const r = await api<Product>('/api/products', 'POST', f); toast('Product created.'); router.push(`/products/${r.id}`); router.refresh(); }
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!p || !window.confirm(`Delete ${p.name}?`)) return;
    try { await api(`/api/products/${p.id}`, 'DELETE'); toast('Product deleted.'); router.push('/products'); router.refresh(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  const vatNow = f.vat === 'default' ? vatDefaults[f.type] ?? 0 : Number(f.vat);
  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href="/products">Products</Link><span className="sep">/</span><span>{p ? p.name : 'New product'}</span></div>
        <div className="cp-actions">
          {dirty && <span className="dirty">Unsaved changes</span>}
          <button className="btn primary" onClick={save} disabled={busy || (!!p && !dirty)}>{busy ? 'Saving…' : 'Save'}</button>
          {!p && <Link className="btn" href="/products">Cancel</Link>}
          {p && (p.used ? <button className="btn" onClick={() => set('active', !f.active)}>{f.active ? 'Archive' : 'Restore'}</button> : <button className="btn ghost" onClick={remove}>Delete</button>)}
        </div>
        {p && !f.active && <div className="cp-tools"><span className="badge">Archived</span></div>}
      </div>
      <div className="recpage">
        <div className="recmain">
          <section className="sheet">
            <div className="grid">
              <TextField id="p-name" label="Name" value={f.name} onChange={(v) => set('name', v)} />
              <TextField id="p-code" label="Code (optional)" value={f.code} onChange={(v) => set('code', v)} />
              <SelectField id="p-type" label="Service type" value={f.type} options={SERVICE_TYPES} onChange={(v) => set('type', v as Draft['type'])} />
              <SelectField id="p-sup" label="Usual supplier" value={f.supplierId} options={[['', 'None'], ...suppliers.map((s) => [s.id, s.name] as [string, string])]} onChange={(v) => set('supplierId', v)} />
              <TextArea id="p-desc" label="Description used on the booking" value={f.desc} onChange={(v) => set('desc', v)} />
            </div>
          </section>
          <section className="sheet">
            <h2>Cost and selling price</h2>
            <div className="grid">
              <NumberField id="p-cost" label="Supplier cost (USD)" step="0.01" value={f.cost} onChange={(v) => set('cost', v)} />
              <SelectField id="p-pr" label="Markup" value={f.pricing} options={PRODUCT_PRICING} onChange={(v) => set('pricing', v as Draft['pricing'])} />
              {f.pricing !== 'channel' && <NumberField id="p-mk" label={f.pricing === 'percent' ? 'Markup (%)' : 'Markup (USD)'} step={f.pricing === 'percent' ? '0.5' : '1'} value={f.markup} onChange={(v) => set('markup', v)} />}
              <SelectField id="p-vat" label="VAT on the invoice" value={f.vat} options={[['default', `Service default (${vatDefaults[f.type] ?? 0}%)`], ['0', '0%'], ['11', '11%']]} onChange={(v) => set('vat', v as Draft['vat'])} />
            </div>
            <div className="table-wrap" style={{ marginTop: 12 }}><table className="lines">
              <thead><tr><th>Channel</th><th>Markup</th><th className="num">Selling price</th><th className="num">With VAT ({vatNow}%)</th></tr></thead>
              <tbody>{(['B2C', 'B2B', 'Corporate'] as Channel[]).map((ch) => { const m = productMarkup(f, ch, pricing); const price = sell({ cost: f.cost, ...m }); return (
                <tr key={ch}><td>{ch}</td><td>{fmtMarkup(m.markup, m.markupType)}{f.pricing === 'channel' && <span className="muted"> (Settings)</span>}</td><td className="num">{money(price)}</td><td className="num">{money(price * (1 + vatNow / 100))}</td></tr>); })}
              </tbody></table></div>
            <p className="hint">Adding this product to a booking fills in the service with this cost and markup. You can still change them on the booking. Changing the product later doesn’t change bookings already made.</p>
          </section>
          <section className="sheet">
            <TextArea id="p-notes" label="Internal notes (contract terms, allotments, validity)" value={f.notes} onChange={(v) => set('notes', v)} />
          </section>
        </div>
        {p ? <ActivityPanel model="product" id={p.id} refreshKey={tick} /> : <aside className="chatter"><h3>Activity</h3><p className="muted" style={{ margin: 0 }}>Nothing is saved until you select Save.</p></aside>}
      </div>
    </>
  );
}
