'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { EXP_STATES, VAT_RATES, money, r2, todayISO, type Finance } from '@/lib/constants';
import type { Expense, Option } from '@/lib/types';
import { TextField, TextArea, SelectField, NumberField } from './Fields';
import { ActivityPanel } from './ActivityPanel';
import { DocumentsPanel } from './DocumentsPanel';
import { useToast } from './Toast';

type Draft = Omit<Expense, 'id' | 'ref' | 'status' | 'supplierName' | 'createdAt' | 'docs'>;
const pick = (e: Expense): Draft => ({ date: e.date, description: e.description, categoryId: e.categoryId, amount: e.amount, vat: e.vat, paidFrom: e.paidFrom, supplierId: e.supplierId, reference: e.reference, notes: e.notes });

export function ExpenseForm({ initial, finance, suppliers }: { initial?: Expense; finance: Finance; suppliers: Option[] }) {
  const router = useRouter();
  const toast = useToast();
  const empty: Draft = { date: todayISO(), description: '', categoryId: '', amount: 0, vat: 0, paidFrom: finance.accounts.find((a) => a.type === 'cash')?.id ?? finance.accounts[0].id, supplierId: '', reference: '', notes: '' };
  const [exp, setExp] = useState(initial);
  const [saved, setSaved] = useState(initial ? pick(initial) : empty);
  const [f, setF] = useState(initial ? pick(initial) : empty);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const draft = (exp?.status ?? 'draft') === 'draft';
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  const vatAmt = r2(f.amount * f.vat / 100);
  const apply = (r: Expense) => { setExp(r); setSaved(pick(r)); setF(pick(r)); setTick((x) => x + 1); router.refresh(); };

  async function save() {
    setBusy(true);
    try {
      if (exp) { apply(await api<Expense>(`/api/expenses/${exp.id}`, 'PATCH', f)); toast('Expense saved.'); }
      else { const r = await api<Expense>('/api/expenses', 'POST', f); toast(`${r.ref} saved as a draft.`); router.push(`/expenses/${r.id}`); router.refresh(); }
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function act(action: 'post' | 'draft') {
    if (!exp) return;
    if (dirty) return toast('Save your changes first.', 'err');
    try { apply(await api<Expense>(`/api/expenses/${exp.id}/action`, 'POST', { action })); toast(action === 'post' ? 'Expense posted.' : 'Back to draft.'); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  async function remove() {
    if (!exp || !window.confirm('Delete this draft expense?')) return;
    try { await api(`/api/expenses/${exp.id}`, 'DELETE'); toast('Deleted.'); router.push('/expenses'); router.refresh(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  const paidOpts: [string, string][] = [...finance.accounts.map((a) => [a.id, a.name] as [string, string]), ['supplier', 'On credit, pay the vendor later']];
  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href="/expenses">Expenses</Link><span className="sep">/</span><span>{exp ? `${exp.ref}, ${saved.description}` : 'New expense'}</span></div>
        <div className="cp-actions">
          {dirty && <span className="dirty">Unsaved changes</span>}
          {draft && <button className="btn primary" onClick={save} disabled={busy || (!!exp && !dirty)}>{busy ? 'Saving…' : 'Save'}</button>}
          {exp ? (dirty && <button className="btn" onClick={() => setF(saved)}>Discard</button>) : <Link className="btn" href="/expenses">Cancel</Link>}
          {exp && draft && <button className="btn" onClick={() => act('post')}>Post expense</button>}
          {exp && !draft && <button className="btn" onClick={() => act('draft')}>Reset to draft</button>}
          {exp && draft && <button className="btn ghost" onClick={remove}>Delete</button>}
        </div>
        <div className="cp-tools"><ol className="statusbar">{EXP_STATES.map(([k, l]) => <li key={k} className={k === (exp?.status ?? 'draft') ? 'on' : ''}>{l}</li>)}</ol></div>
      </div>
      <div className="recpage">
        <div className="recmain">
          <section className="sheet">
            <div className="grid">
              <TextField id="e-desc" label="Description" wide value={f.description} onChange={(v) => setF({ ...f, description: v })} disabled={!draft} />
              <TextField id="e-date" label="Date" type="date" value={f.date} onChange={(v) => setF({ ...f, date: v })} disabled={!draft} />
              <SelectField id="e-cat" label="Category" value={f.categoryId} options={[['', 'Choose…'], ...finance.categories.map((c) => [c.id, c.name] as [string, string])]} onChange={(v) => setF({ ...f, categoryId: v })} disabled={!draft} />
              <NumberField id="e-amt" label="Amount excl. VAT (USD)" step="0.01" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} disabled={!draft} />
              <SelectField id="e-vat" label="VAT" value={String(f.vat)} options={VAT_RATES} onChange={(v) => setF({ ...f, vat: Number(v) })} disabled={!draft} />
              <SelectField id="e-paid" label="Paid from" value={f.paidFrom} options={paidOpts} onChange={(v) => setF({ ...f, paidFrom: v })} disabled={!draft} />
              <SelectField id="e-sup" label={f.paidFrom === 'supplier' ? 'Vendor' : 'Vendor (optional)'} value={f.supplierId} options={[['', 'None'], ...suppliers.map((s) => [s.id, s.name] as [string, string])]} onChange={(v) => setF({ ...f, supplierId: v })} disabled={!draft} />
              <TextField id="e-ref" label="Receipt or invoice number" value={f.reference} onChange={(v) => setF({ ...f, reference: v })} disabled={!draft} />
              <TextArea id="e-notes" label="Notes" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} disabled={!draft} />
            </div>
            <div className="totals"><div><span>VAT</span><b>{money(vatAmt)}</b></div><div className="grand"><span>Total incl. VAT</span><b>{money(r2(f.amount + vatAmt))}</b></div></div>
          </section>
          {exp ? <DocumentsPanel model="expense" id={exp.id} docs={exp.docs} defaultKind="receipt" title="Receipts and invoices"
            emptyText="No receipt yet. Attach a photo or PDF of the receipt or the vendor’s invoice." onChange={() => setTick((x) => x + 1)} />
            : <section className="sheet"><h2>Receipts and invoices</h2><p className="muted" style={{ margin: 0 }}>Save the expense first, then attach its receipt.</p></section>}
        </div>
        {exp ? <ActivityPanel model="expense" id={exp.id} refreshKey={tick} /> : <aside className="chatter"><h3>Activity</h3><p className="muted" style={{ margin: 0 }}>Nothing is saved until you select Save.</p></aside>}
      </div>
    </>
  );
}
