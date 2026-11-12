'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { ACCOUNT_TYPES, SERVICE_TYPES, VAT_RATES, type Finance, type PayAccount } from '@/lib/constants';
import { NumberField, SelectField } from './Fields';
import { useToast } from './Toast';

const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'ACC';

export function FinanceSettings({ initial, canEdit }: { initial: Finance; canEdit: boolean }) {
  const [f, setF] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [na, setNa] = useState({ name: '', type: 'bank' as PayAccount['type'] });
  const [nc, setNc] = useState('');
  const toast = useToast();
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  async function save() {
    setBusy(true);
    try { const r = await api<Finance>('/api/settings/finance', 'PUT', f); setF(r); setSaved(r); toast('Invoicing and payment settings saved.'); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  function addAccount() {
    if (!na.name.trim()) return toast('Name the account.', 'err');
    let id = slug(na.name); let n = 2;
    while (f.accounts.some((a) => a.id === id)) id = `${slug(na.name)}${n++}`;
    setF({ ...f, accounts: [...f.accounts, { id, name: na.name.trim(), type: na.type }] }); setNa({ name: '', type: 'bank' });
  }
  function addCategory() {
    if (!nc.trim()) return toast('Name the category.', 'err');
    let id = nc.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) || 'cat'; let n = 2;
    while (f.categories.some((c) => c.id === id)) id = `${id}-${n++}`;
    setF({ ...f, categories: [...f.categories, { id, name: nc.trim() }] }); setNc('');
  }
  const dis = !canEdit;
  return (
    <section className="sheet" style={{ marginBottom: 16 }}>
      <h2>Invoicing, payments and expenses</h2>
      <h3 className="sub3" style={{ marginTop: 0 }}>Payment terms (days)</h3>
      <div className="grid">
        <NumberField id="t-cust" label="Individuals" value={f.terms.customer} onChange={(v) => setF({ ...f, terms: { ...f.terms, customer: Math.round(v) } })} disabled={dis} />
        <NumberField id="t-ag" label="B2B agencies" value={f.terms.agency} onChange={(v) => setF({ ...f, terms: { ...f.terms, agency: Math.round(v) } })} disabled={dis} />
        <NumberField id="t-corp" label="Corporate" value={f.terms.corporate} onChange={(v) => setF({ ...f, terms: { ...f.terms, corporate: Math.round(v) } })} disabled={dis} />
        <NumberField id="t-sup" label="Supplier terms, for paying bills" value={f.supplierTerms} onChange={(v) => setF({ ...f, supplierTerms: Math.round(v) })} disabled={dis} />
      </div>
      <h3 className="sub3">Default VAT on invoices, by service</h3>
      <div className="grid">
        {SERVICE_TYPES.map(([k, l]) => <SelectField key={k} id={`vat-${k}`} label={l} value={String(f.vat[k])} options={VAT_RATES} onChange={(v) => setF({ ...f, vat: { ...f.vat, [k]: Number(v) } })} disabled={dis} />)}
      </div>
      <p className="hint">International air tickets default to 0%. Confirm each service’s VAT treatment with your accountant.</p>
      <h3 className="sub3">Bank, cash and wallet accounts</h3>
      <div className="table-wrap"><table className="lines"><thead><tr><th>Code</th><th>Name</th><th>Type</th>{canEdit && <th><span className="sr">Remove</span></th>}</tr></thead><tbody>
        {f.accounts.map((a) => (
          <tr key={a.id}><td><strong>{a.id}</strong></td>
            <td><input aria-label="Account name" value={a.name} disabled={dis} onChange={(e) => setF({ ...f, accounts: f.accounts.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)) })} /></td>
            <td><select aria-label="Account type" value={a.type} disabled={dis} onChange={(e) => setF({ ...f, accounts: f.accounts.map((x) => (x.id === a.id ? { ...x, type: e.target.value as PayAccount['type'] } : x)) })}>{ACCOUNT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
            {canEdit && <td><button className="icon-btn" aria-label={`Remove ${a.name}`} onClick={() => setF({ ...f, accounts: f.accounts.filter((x) => x.id !== a.id) })}>×</button></td>}
          </tr>))}
      </tbody></table></div>
      {canEdit && <div className="addrow"><input className="sel" aria-label="New account name" placeholder="New account, e.g. Mobile wallet" value={na.name} onChange={(e) => setNa({ ...na, name: e.target.value })} />
        <select className="sel" aria-label="New account type" value={na.type} onChange={(e) => setNa({ ...na, type: e.target.value as PayAccount['type'] })}>{ACCOUNT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button className="btn" onClick={addAccount}>Add account</button></div>}
      <h3 className="sub3">Expense categories</h3>
      <div className="chips">{f.categories.map((c) => (
        <span key={c.id} className="chip">{c.name}{canEdit && <button className="icon-btn" style={{ fontSize: 15, padding: '0 0 0 6px' }} aria-label={`Remove ${c.name}`} onClick={() => setF({ ...f, categories: f.categories.filter((x) => x.id !== c.id) })}>×</button>}</span>))}</div>
      {canEdit && <div className="addrow"><input className="sel" aria-label="New category" placeholder="New category, e.g. Courier" value={nc} onChange={(e) => setNc(e.target.value)} /><button className="btn" onClick={addCategory}>Add category</button></div>}
      <h3 className="sub3">Purchasing</h3>
      <div className="grid"><SelectField id="autopo" label="Create purchase orders when a booking is confirmed" value={f.autoPO} options={[['yes', 'Yes'], ['no', 'No']]} onChange={(v) => setF({ ...f, autoPO: v as 'yes' | 'no' })} disabled={dis} /></div>
      {canEdit && <div className="addrow"><button className="btn primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</button>{dirty && <button className="btn" onClick={() => setF(saved)}>Discard</button>}</div>}
      {!canEdit && <p className="hint">Only administrators can change these settings.</p>}
    </section>
  );
}
