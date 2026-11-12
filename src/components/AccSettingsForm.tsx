'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { SERVICE_TYPES, DEFAULT_PAYMENT_LEDGER, type AccSettings, type Finance, type LedgerAccount } from '@/lib/constants';
import { useToast } from './Toast';

export function AccSettingsForm({ initial, chart, finance }: { initial: AccSettings; chart: LedgerAccount[]; finance: Finance }) {
  const withPay = { ...initial, payment: { ...Object.fromEntries(finance.accounts.map((a) => [a.id, DEFAULT_PAYMENT_LEDGER[a.type]])), ...initial.payment } };
  const [s, setS] = useState(withPay);
  const [saved, setSaved] = useState(withPay);
  const [busy, setBusy] = useState(false);
  const [nc, setNc] = useState({ code: '', name: '', rate: '' });
  const toast = useToast();
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const opts = (cls: string[]) => chart.filter((a) => cls.includes(a.code[0])).map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>);
  const sel = (id: string, value: string, cls: string[], on: (v: string) => void, lbl: string) => (
    <label className="fld" htmlFor={id}><span>{lbl}</span><select id={id} value={value} onChange={(e) => on(e.target.value)}>{opts(cls)}</select></label>
  );
  async function save() {
    setBusy(true);
    try { const r = await api<AccSettings>('/api/accounting/settings', 'PUT', s); setS(r); setSaved(r); toast('Accounting settings saved.'); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  function addCurrency() {
    const code = nc.code.trim().toUpperCase(), rate = parseFloat(nc.rate);
    if (!/^[A-Z]{3}$/.test(code)) return toast('Use a 3-letter currency code, like GBP.', 'err');
    if (s.currencies.some((c) => c.code === code)) return toast(`${code} is already in the list.`, 'err');
    if (!nc.name.trim() || !(rate > 0)) return toast('Add the name and how many units equal 1 USD.', 'err');
    setS({ ...s, currencies: [...s.currencies, { code, name: nc.name.trim(), rate }] }); setNc({ code: '', name: '', rate: '' });
  }
  return (
    <>
      <section className="sheet" style={{ marginBottom: 16 }}>
        <h2>Where documents post</h2>
        <h3 className="sub3" style={{ marginTop: 0 }}>Revenue and cost by service</h3>
        <div className="table-wrap"><table className="lines"><thead><tr><th>Service</th><th>Revenue account</th><th>Cost account</th></tr></thead><tbody>
          {SERVICE_TYPES.map(([k, l]) => (
            <tr key={k}><td>{l}</td>
              <td><select aria-label={`${l} revenue`} value={s.rev[k]} onChange={(e) => setS({ ...s, rev: { ...s.rev, [k]: e.target.value } })}>{opts(['7'])}</select></td>
              <td><select aria-label={`${l} cost`} value={s.cost[k]} onChange={(e) => setS({ ...s, cost: { ...s.cost, [k]: e.target.value } })}>{opts(['6'])}</select></td></tr>
          ))}
        </tbody></table></div>
        <h3 className="sub3">Expense categories</h3>
        <div className="grid">{finance.categories.map((c) => sel(`ex-${c.id}`, s.expense[c.id] ?? '658', ['6'], (v) => setS({ ...s, expense: { ...s.expense, [c.id]: v } }), c.name))}</div>
        <h3 className="sub3">Bank, cash and wallet accounts</h3>
        <div className="grid">{finance.accounts.map((a) => sel(`pa-${a.id}`, s.payment[a.id], ['5'], (v) => setS({ ...s, payment: { ...s.payment, [a.id]: v } }), a.name))}</div>
        <h3 className="sub3">Key accounts</h3>
        <div className="grid">
          {sel('k-rec', s.receivable, ['4'], (v) => setS({ ...s, receivable: v }), 'Customers (receivable)')}
          {sel('k-pay', s.payable, ['4'], (v) => setS({ ...s, payable: v }), 'Suppliers (payable)')}
          {sel('k-vo', s.vatOut, ['4'], (v) => setS({ ...s, vatOut: v }), 'VAT collected')}
          {sel('k-vi', s.vatIn, ['4'], (v) => setS({ ...s, vatIn: v }), 'VAT recoverable')}
          {sel('k-ob', s.openingOffset, ['1'], (v) => setS({ ...s, openingOffset: v }), 'Offset for opening balances')}
        </div>
        <p className="hint">Changes apply to new entries and to documents that change later; posted history stays as it was. Have your accountant review this mapping and the chart of accounts.</p>
      </section>
      <section className="sheet">
        <h2>Currencies and exchange rates</h2>
        <div className="table-wrap"><table className="lines"><thead><tr><th>Currency</th><th>Name</th><th className="num">Units per 1 USD</th></tr></thead><tbody>
          {s.currencies.map((c) => (
            <tr key={c.code}><td><strong>{c.code}</strong>{c.code === 'USD' && <span className="badge b-accent" style={{ marginLeft: 6 }}>Base</span>}</td><td>{c.name}</td>
              <td className="num">{c.code === 'USD' ? '1' : <input className="w-num" type="number" min={0} step="any" aria-label={`${c.code} per USD`} value={c.rate}
                onChange={(e) => setS({ ...s, ratesUpdated: new Date().toISOString().slice(0, 10), currencies: s.currencies.map((x) => (x.code === c.code ? { ...x, rate: parseFloat(e.target.value) || 0 } : x)) })} />}</td></tr>
          ))}
        </tbody></table></div>
        <div className="addrow">
          <input className="sel" style={{ width: 120 }} placeholder="Code, e.g. GBP" aria-label="Currency code" value={nc.code} onChange={(e) => setNc({ ...nc, code: e.target.value })} />
          <input className="sel" placeholder="Name" aria-label="Currency name" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
          <input className="sel" style={{ width: 140 }} type="number" min={0} step="any" placeholder="Units per USD" aria-label="Units per USD" value={nc.rate} onChange={(e) => setNc({ ...nc, rate: e.target.value })} />
          <button className="btn" onClick={addCurrency}>Add currency</button>
        </div>
        <p className="hint">The books are kept in USD. The LBP rate converts reports and the VAT summary to LBP equivalents. The sample rates are placeholders, so set your own before use.</p>
      </section>
      <div className="addrow"><button className="btn primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save accounting settings'}</button>{dirty && <button className="btn" onClick={() => setS(saved)}>Discard</button>}</div>
    </>
  );
}
