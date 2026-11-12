'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { PO_STATES, docTotals, fmtDate, todayISO, type Finance } from '@/lib/constants';
import type { Option, Purchase } from '@/lib/types';
import { TextField, TextArea, SelectField, ReadOnly } from './Fields';
import { TaxLines } from './TaxLines';
import { PaymentBox } from './PaymentBox';
import { ActivityPanel } from './ActivityPanel';
import { Modal } from './Modal';
import { useToast } from './Toast';

type Draft = Pick<Purchase, 'supplierId' | 'orderDate' | 'billRef' | 'billDate' | 'lines' | 'notes'>;
const pick = (p: Purchase): Draft => ({ supplierId: p.supplierId, orderDate: p.orderDate, billRef: p.billRef, billDate: p.billDate, lines: p.lines, notes: p.notes });
const EMPTY: Draft = { supplierId: '', orderDate: todayISO(), billRef: '', billDate: '', lines: [], notes: '' };

export function PurchaseForm({ initial, finance, suppliers }: { initial?: Purchase; finance: Finance; suppliers: Option[] }) {
  const router = useRouter();
  const toast = useToast();
  const [po, setPo] = useState(initial);
  const [saved, setSaved] = useState(initial ? pick(initial) : EMPTY);
  const [f, setF] = useState(initial ? pick(initial) : EMPTY);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [bill, setBill] = useState<null | { billRef: string; billDate: string }>(null);
  const status = po?.status ?? 'draft';
  const editable = status === 'draft' || status === 'confirmed';
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  const t = docTotals(f.lines, po?.payments ?? []);
  const apply = (r: Purchase) => { setPo(r); setSaved(pick(r)); setF(pick(r)); setTick((x) => x + 1); router.refresh(); };

  async function save() {
    setBusy(true);
    try {
      if (po) { apply(await api<Purchase>(`/api/purchases/${po.id}`, 'PATCH', f)); toast('Order saved.'); }
      else { const r = await api<Purchase>('/api/purchases', 'POST', f); toast(`${r.ref} created.`); router.push(`/purchasing/${r.id}`); router.refresh(); }
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function act(body: Record<string, unknown>, msg: string) {
    if (!po) return;
    if (dirty) return toast('Save your changes first.', 'err');
    try { apply(await api<Purchase>(`/api/purchases/${po.id}/action`, 'POST', body)); toast(msg); setBill(null); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  async function remove() {
    if (!po || !window.confirm(`Delete ${po.ref}?`)) return;
    try { await api(`/api/purchases/${po.id}`, 'DELETE'); toast('Deleted.'); router.push('/purchasing'); router.refresh(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  async function pay(p: { date: string; amount: number; method: string; accountId: string }) {
    if (!po) return;
    try {
      const r = await api<{ purchase: Purchase; paymentId: string }>(`/api/purchases/${po.id}/payments`, 'POST', p);
      apply(r.purchase); toast('Payment recorded.');
      window.open(`/print/voucher/${po.id}/${r.paymentId}`, '_blank', 'noopener');
    } catch (e) { toast((e as Error).message, 'err'); throw e; }
  }

  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href="/purchasing">Purchasing</Link><span className="sep">/</span><span>{po?.ref ?? 'New request for quotation'}</span></div>
        <div className="cp-actions">
          {dirty && <span className="dirty">Unsaved changes</span>}
          {editable && <button className="btn primary" onClick={save} disabled={busy || (!!po && !dirty)}>{busy ? 'Saving…' : 'Save'}</button>}
          {po ? (dirty && <button className="btn" onClick={() => setF(saved)}>Discard</button>) : <Link className="btn" href="/purchasing">Cancel</Link>}
          {po && status === 'draft' && <button className="btn" onClick={() => act({ action: 'confirm' }, 'Purchase order confirmed.')}>Confirm order</button>}
          {po && status === 'confirmed' && <button className="btn" onClick={() => setBill({ billRef: f.billRef, billDate: f.billDate || todayISO() })}>Record supplier bill</button>}
          {po && editable && <button className="btn" onClick={() => window.confirm('Cancel this order?') && act({ action: 'cancel' }, 'Order cancelled.')}>Cancel order</button>}
          {po && status === 'cancelled' && <button className="btn" onClick={() => act({ action: 'draft' }, 'Back to request for quotation.')}>Reset to request</button>}
          {po && <a className="btn" href={`/print/po/${po.id}`} target="_blank" rel="noopener">Print purchase order</a>}
          {po && status === 'draft' && <button className="btn ghost" onClick={remove}>Delete</button>}
        </div>
        <div className="cp-tools">
          <ol className="statusbar" aria-label="Status">
            {PO_STATES.filter(([k]) => k !== 'cancelled' || status === 'cancelled').map(([k, l]) => <li key={k} className={`${k === status ? 'on' : ''} ${k === 'cancelled' ? 'cancel' : ''}`}>{l}</li>)}
          </ol>
        </div>
      </div>
      <div className="recpage">
        <div className="recmain">
          <section className="sheet">
            <div className="grid">
              {editable && (!po || status === 'draft')
                ? <SelectField id="p-sup" label="Supplier" value={f.supplierId} options={[['', 'Choose…'], ...suppliers.map((s) => [s.id, s.name] as [string, string])]} onChange={(v) => setF({ ...f, supplierId: v })} />
                : <ReadOnly label="Supplier">{po?.supplierName}</ReadOnly>}
              <ReadOnly label="For booking">{po?.bookingId ? <Link className="link" href={`/bookings/${po.bookingId}`}>{po.bookingRef}</Link> : 'None'}</ReadOnly>
              <TextField id="p-date" label="Order date" type="date" value={f.orderDate} onChange={(v) => setF({ ...f, orderDate: v })} disabled={!editable} />
              <TextField id="p-billref" label="Supplier bill number" value={f.billRef} onChange={(v) => setF({ ...f, billRef: v })} disabled={!editable} />
              {(status === 'billed' || status === 'paid') && <ReadOnly label="Bill date">{fmtDate(f.billDate)}</ReadOnly>}
              <TextArea id="p-notes" label="Notes printed on the order" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} disabled={!editable} />
            </div>
          </section>
          <section className="sheet">
            <h2>Purchased services</h2>
            <TaxLines lines={f.lines} onChange={(lines) => setF({ ...f, lines })} editable={editable} amountLabel="Cost excl. VAT" vatFor={() => 0} payments={po?.payments ?? []} />
          </section>
          {po && (status === 'billed' || status === 'paid') && (
            <PaymentBox title="Payments to supplier" payments={po.payments} accounts={finance.accounts} balance={t.balance} canPay={status === 'billed'}
              onPay={pay} printHref={(p) => `/print/voucher/${po.id}/${p.id}`} printLabel="Print voucher" emptyText="No payments yet." />
          )}
        </div>
        {po ? <ActivityPanel model="purchase" id={po.id} refreshKey={tick} /> : <aside className="chatter"><h3>Activity</h3><p className="muted" style={{ margin: 0 }}>Nothing is saved until you select Save.</p></aside>}
      </div>
      {bill && (
        <Modal title="Record the supplier’s bill" onClose={() => setBill(null)}>
          <div className="grid">
            <TextField id="b-ref" label="Supplier bill number" value={bill.billRef} onChange={(v) => setBill({ ...bill, billRef: v })} />
            <TextField id="b-date" label="Bill date" type="date" value={bill.billDate} onChange={(v) => setBill({ ...bill, billDate: v })} />
          </div>
          <p className="hint">The order total is what you owe. Adjust the lines first if the bill differs from the order.</p>
          <div className="dlg-actions"><button className="btn" onClick={() => setBill(null)}>Cancel</button><button className="btn primary" onClick={() => act({ action: 'bill', ...bill }, 'Supplier bill recorded.')}>Record bill</button></div>
        </Modal>
      )}
    </>
  );
}
