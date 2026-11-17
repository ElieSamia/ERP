'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { SERVICE_TYPES, label, money, productMarkup, sell, type Channel, type Pricing, type Product } from '@/lib/constants';
import { Modal } from './Modal';

/** Lets staff add a catalogue product to a booking: it fills in type, description, supplier, cost, markup and VAT. */
export function CataloguePicker({ channel, pricing, onPick, onClose }: { channel: Channel; pricing: Pricing; onPick: (p: Product) => void; onClose: () => void }) {
  const [list, setList] = useState<Product[] | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { api<Product[]>('/api/products?active=yes').then(setList).catch((e) => setErr((e as Error).message)); }, []);
  const ql = q.trim().toLowerCase();
  const shown = (list ?? []).filter((p) => !ql || `${p.name} ${p.code} ${p.desc} ${p.supplierName ?? ''}`.toLowerCase().includes(ql));
  return (
    <Modal title="Add from catalogue" onClose={onClose}>
      <label className="sr" htmlFor="cat-q">Search products</label>
      <input id="cat-q" className="sel" style={{ width: '100%' }} autoFocus placeholder="Search name, code, description or supplier" value={q} onChange={(e) => setQ(e.target.value)} />
      {err ? <p className="form-error">{err}</p> : list === null ? <p className="muted">Loading…</p> : list.length === 0 ? <p className="muted">The catalogue is empty. Add products under Products first.</p> : (
        <div className="table-wrap" style={{ marginTop: 10, maxHeight: 360, overflowY: 'auto' }}><table>
          <thead><tr><th>Product</th><th>Type</th><th>Supplier</th><th className="num">Price ({channel})</th><th><span className="sr">Add</span></th></tr></thead>
          <tbody>{shown.map((p) => (
            <tr key={p.id}><td><strong>{p.name}</strong>{p.code && <span className="muted"> {p.code}</span>}</td><td>{label(SERVICE_TYPES, p.type)}</td><td>{p.supplierName ?? ''}</td>
              <td className="num">{money(sell({ cost: p.cost, ...productMarkup(p, channel, pricing) }))}</td>
              <td style={{ textAlign: 'right' }}><button className="btn primary" onClick={() => onPick(p)}>Add</button></td></tr>))}
            {shown.length === 0 && <tr><td colSpan={5} className="muted">No product matches “{q}”.</td></tr>}
          </tbody></table></div>
      )}
      <p className="hint">Prices shown are for this customer’s channel, before VAT. You can adjust the service after adding it.</p>
    </Modal>
  );
}
