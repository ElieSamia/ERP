'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { INVOICE_STATES, docTotals, r2, type Finance } from '@/lib/constants';
import type { Invoice } from '@/lib/types';
import { TextField, TextArea, ReadOnly } from './Fields';
import { TaxLines } from './TaxLines';
import { PaymentBox } from './PaymentBox';
import { CreditPanel } from './CreditPanel';
import { ActivityPanel } from './ActivityPanel';
import { useToast } from './Toast';

type Draft = Pick<Invoice, 'date' | 'dueDate' | 'lines' | 'notes' | 'currency' | 'rate'>;
const pick = (i: Invoice): Draft => ({ date: i.date, dueDate: i.dueDate, lines: i.lines, notes: i.notes, currency: i.currency, rate: i.rate });
type Target = { id: string; ref: string; balance: number };

export function InvoiceForm({ initial, finance, currencies = [], targets = [] }: { initial: Invoice; finance: Finance; currencies?: { code: string; rate: number }[]; targets?: Target[] }) {
  const router = useRouter();
  const toast = useToast();
  const [inv, setInv] = useState(initial);
  const [saved, setSaved] = useState(pick(initial));
  const [f, setF] = useState(pick(initial));
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const draft = inv.status === 'draft';
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  const t = docTotals(f.lines, inv.payments);
  const apply = (r: Invoice) => { setInv(r); setSaved(pick(r)); setF(pick(r)); setTick((x) => x + 1); router.refresh(); };

  async function save() {
    setBusy(true);
    try { apply(await api<Invoice>(`/api/invoices/${inv.id}`, 'PATCH', f)); toast('Invoice saved.'); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function act(action: 'post' | 'draft') {
    if (dirty) return toast('Save your changes first.', 'err');
    try { const r = await api<Invoice>(`/api/invoices/${inv.id}/action`, 'POST', { action }); apply(r); toast(action === 'post' ? `Posted as ${r.number}.` : 'Back to draft.'); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  async function remove() {
    if (!window.confirm('Delete this draft invoice? The booking goes back to its previous status.')) return;
    try { await api(`/api/invoices/${inv.id}`, 'DELETE'); toast('Draft invoice deleted.'); router.push(inv.bookingId ? `/bookings/${inv.bookingId}` : '/invoicing'); router.refresh(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  async function cancelPay(p: { id: string }, reason: string) {
    try { apply(await api<Invoice>(`/api/invoices/${inv.id}/payments/${p.id}/cancel`, 'POST', { reason })); toast('Payment cancelled.'); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  /** Switching currency converts the line amounts at the two rates, then the rate stays editable. */
  function setCurrency(code: string) {
    const rate = code === 'USD' ? 1 : currencies.find((c) => c.code === code)?.rate ?? 1;
    setF({ ...f, currency: code, rate, lines: f.lines.map((l) => ({ ...l, amount: r2((l.amount / (f.rate || 1)) * rate) })) });
  }
  async function pay(p: { date: string; amount: number; method: string; accountId: string }) {
    try {
      const r = await api<{ invoice: Invoice; paymentId: string }>(`/api/invoices/${inv.id}/payments`, 'POST', p);
      apply(r.invoice); toast('Payment recorded.');
      window.open(`/print/receipt/${inv.id}/${r.paymentId}`, '_blank', 'noopener');
    } catch (e) { toast((e as Error).message, 'err'); throw e; }
  }

  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href="/invoicing">Invoicing</Link><span className="sep">/</span><span>{inv.number ?? 'Draft invoice'}</span></div>
        <div className="cp-actions">
          {dirty && <span className="dirty">Unsaved changes</span>}
          {draft && <button className="btn primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</button>}
          {draft && dirty && <button className="btn" onClick={() => setF(saved)}>Discard</button>}
          {draft && <button className="btn" onClick={() => act('post')}>Post invoice</button>}
          {inv.status === 'posted' && !inv.payments.some((p) => !p.cancelled) && <button className="btn" onClick={() => act('draft')}>Reset to draft</button>}
          <a className="btn" href={`/print/invoice/${inv.id}`} target="_blank" rel="noopener">Print invoice</a>
          {draft && <button className="btn ghost" onClick={remove}>Delete</button>}
        </div>
        <div className="cp-tools">
          <ol className="statusbar" aria-label="Status">{INVOICE_STATES.map(([k, l]) => <li key={k} className={k === inv.status ? 'on' : ''}>{l}</li>)}</ol>
        </div>
      </div>
      <div className="recpage">
        <div className="recmain">
          <section className="sheet">
            <div className="grid">
              <ReadOnly label="Customer"><Link className="link" href={`/contacts/${inv.contactId}`}>{inv.contactName}</Link></ReadOnly>
              <ReadOnly label="Booking">{inv.bookingId ? <Link className="link" href={`/bookings/${inv.bookingId}`}>{inv.bookingRef}</Link> : 'None'}</ReadOnly>
              <TextField id="i-date" label="Invoice date" type="date" value={f.date} onChange={(v) => setF({ ...f, date: v })} disabled={!draft} />
              <TextField id="i-due" label="Due date" type="date" value={f.dueDate} min={f.date} error={f.dueDate && f.date && f.dueDate < f.date ? 'The due date can’t be before the invoice date.' : ''} onChange={(v) => setF({ ...f, dueDate: v })} disabled={!draft} />
              <label className="fld" htmlFor="i-cur"><span>Currency</span>
                <select id="i-cur" value={f.currency} disabled={!draft} onChange={(e) => setCurrency(e.target.value)}>
                  {['USD', ...currencies.map((c) => c.code).filter((c) => c !== 'USD')].map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
              {f.currency !== 'USD' && <TextField id="i-rate" label={`Rate: ${f.currency} per 1 USD`} type="number" value={String(f.rate)} onChange={(v) => setF({ ...f, rate: parseFloat(v) || 0 })} disabled={!draft} />}
              <TextArea id="i-notes" label="Notes printed on the invoice" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} disabled={!draft} />
            </div>
          </section>
          <section className="sheet">
            <h2>Invoice lines</h2>
            <TaxLines lines={f.lines} onChange={(lines) => setF({ ...f, lines })} editable={draft} amountLabel="Amount excl. VAT" vatFor={(ty) => finance.vat[ty] ?? 11} payments={inv.payments} />
          </section>
          <PaymentBox title="Payments" payments={inv.payments} accounts={finance.accounts} balance={t.balance} canPay={inv.status === 'posted'} currency={inv.currency}
            onCancel={inv.status !== 'draft' ? cancelPay : undefined} onPay={pay} printHref={(p) => `/print/receipt/${inv.id}/${p.id}`} printLabel="Print receipt"
            emptyText={draft ? 'Post the invoice to start recording payments.' : 'No payments yet.'} />
          {!draft && <CreditPanel side="customer" docId={inv.id} docRef={inv.number ?? ''} currency={inv.currency} lines={inv.lines} open={inv.status !== 'draft'} accounts={finance.accounts} targets={targets} onChange={async () => apply(await api<Invoice>(`/api/invoices/${inv.id}`))} />}
        </div>
        <ActivityPanel model="invoice" id={inv.id} refreshKey={tick} />
      </div>
    </>
  );
}
