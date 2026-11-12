'use client';
import { SERVICE_TYPES, VAT_RATES, docTotals, label, money, r2 } from '@/lib/constants';
import type { Payment, TaxLine } from '@/lib/types';

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));

/** Lines with a service type, VAT rate and amount, used by invoices and purchase orders. */
export function TaxLines({ lines, onChange, editable, amountLabel, vatFor, payments = [] }: {
  lines: TaxLine[]; onChange: (l: TaxLine[]) => void; editable: boolean; amountLabel: string; vatFor: (type: TaxLine['type']) => number; payments?: Payment[];
}) {
  const t = docTotals(lines, payments);
  const set = (id: string, p: Partial<TaxLine>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...p } : l)));
  return (
    <>
      {lines.length ? (
        <div className="table-wrap">
          <table className="lines">
            <thead><tr><th>Description</th><th>Service</th><th>VAT</th><th className="num">{amountLabel}</th><th className="num">VAT amount</th>{editable && <th><span className="sr">Remove</span></th>}</tr></thead>
            <tbody>
              {lines.map((l) => editable ? (
                <tr key={l.id}>
                  <td><input className="w-desc" aria-label="Description" value={l.desc} onChange={(e) => set(l.id, { desc: e.target.value })} /></td>
                  <td><select aria-label="Service type" value={l.type} onChange={(e) => { const type = e.target.value as TaxLine['type']; set(l.id, { type, vat: vatFor(type) }); }}>{SERVICE_TYPES.map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}</select></td>
                  <td><select aria-label="VAT rate" value={String(l.vat)} onChange={(e) => set(l.id, { vat: Number(e.target.value) })}>{VAT_RATES.map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}</select></td>
                  <td className="num"><input className="w-num" type="number" min={0} step="0.01" aria-label={amountLabel} value={l.amount} onChange={(e) => set(l.id, { amount: parseFloat(e.target.value) || 0 })} /></td>
                  <td className="num">{money(r2(l.amount * l.vat / 100))}</td>
                  <td><button className="icon-btn" aria-label="Remove line" onClick={() => onChange(lines.filter((x) => x.id !== l.id))}>×</button></td>
                </tr>
              ) : (
                <tr key={l.id}><td>{l.desc}</td><td>{label(SERVICE_TYPES, l.type)}</td><td>{l.vat}%</td><td className="num">{money(l.amount)}</td><td className="num">{money(r2(l.amount * l.vat / 100))}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="empty">No lines yet.</div>}
      {editable && <div className="addrow"><button className="btn" onClick={() => onChange([...lines, { id: newId(), type: 'package', desc: '', amount: 0, vat: vatFor('package') }])}>Add line</button></div>}
      <div className="totals">
        <div><span>Untaxed amount</span><b>{money(t.untaxed)}</b></div>
        <div><span>VAT</span><b>{money(t.vat)}</b></div>
        <div><span>Total</span><b>{money(t.total)}</b></div>
        {payments.length > 0 && <div><span>Paid</span><b>{money(t.paid)}</b></div>}
        <div className="grand"><span>{payments.length ? 'Balance due' : 'Total'}</span><b>{money(payments.length ? t.balance : t.total)}</b></div>
      </div>
    </>
  );
}
