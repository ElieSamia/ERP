'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { PAY_METHODS, docTotals, fmtDate, money, r2, todayISO, type PayAccount } from '@/lib/constants';
import type { CreditNote, TaxLine } from '@/lib/types';
import { DateInput } from './DateInput';
import { Modal } from './Modal';
import { useToast } from './Toast';

type Side = 'customer' | 'supplier';
type Target = { id: string; ref: string; balance: number };

/**
 * Credit notes on an invoice (customer) or a supplier bill: create one for all or part of the document, then
 * refund the credit or apply it to another open document. Refunds can be cancelled; everything prints.
 */
export function CreditPanel({ side, docId, docRef, currency, lines, open, accounts, targets, onChange }: {
  side: Side; docId: string; docRef: string; currency: string; lines: TaxLine[]; open: boolean; accounts: PayAccount[]; targets: Target[]; onChange: () => void;
}) {
  const [list, setList] = useState<CreditNote[]>([]);
  const [make, setMake] = useState<null | { date: string; reason: string; theirRef: string; lines: (TaxLine & { on: boolean })[] }>(null);
  const [refund, setRefund] = useState<null | { c: CreditNote; date: string; amount: number; method: string; accountId: string }>(null);
  const [alloc, setAlloc] = useState<null | { c: CreditNote; docId: string; amount: number }>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const m = (n: number) => money(n, currency);
  const cust = side === 'customer';
  const load = () => api<CreditNote[]>(`/api/credits?docId=${docId}`).then((r) => setList(r.filter((c) => c.docId === docId))).catch(() => null);
  useEffect(() => { load(); }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); toast(msg); await load(); onChange(); return true; } catch (e) { toast((e as Error).message, 'err'); return false; } finally { setBusy(false); }
  };
  const credited = r2(list.reduce((s, c) => s + c.total, 0));
  const left = r2(docTotals(lines).total - credited);
  const chosen = make ? make.lines.filter((l) => l.on) : [];
  const mt = docTotals(chosen);
  if (!open && !list.length) return null;
  return (
    <section className="sheet">
      <div className="cp" style={{ marginBottom: 6 }}><h2 style={{ margin: 0 }}>Credit notes and refunds</h2>
        {open && left > 0.004 && <div className="cp-actions"><button className="btn" onClick={() => setMake({ date: todayISO(), reason: '', theirRef: '', lines: lines.map((l) => ({ ...l, on: true })) })}>New credit note…</button></div>}</div>
      {list.length === 0 ? <p className="muted" style={{ margin: 0 }}>{cust ? 'For a trip cancelled or changed after invoicing: a credit note cancels all or part of this invoice, then refund the money or keep it as credit.' : 'When the supplier credits all or part of this bill: record their credit note, then the refund they send or keep it as credit.'}</p> : list.map((c) => (
        <div key={c.id} className="credit">
          <div className="cp"><span><b>{c.number}</b>{c.theirRef ? ` (their ref. ${c.theirRef})` : ''}, {fmtDate(c.date)}: {c.reason}</span>
            <span className="payr"><b>{m(c.total)}</b><a className="btn" href={`/print/credit/${c.id}`} target="_blank" rel="noopener">Print</a></span></div>
          <p className="muted" style={{ margin: '2px 0 6px', fontSize: 13 }}>
            {c.allocations.map((a) => `${m(a.amount)} applied to ${a.ref}`).join(', ') || 'Not applied to any document'}{c.refunded ? `; ${m(c.refunded)} refunded` : ''}{c.available > 0.004 ? `; ${m(c.available)} still available` : ''}.</p>
          {c.refunds.map((r) => (
            <div key={r.id} className={`refund ${r.cancelled ? 'cancelled' : ''}`}>
              <span>{cust ? 'Refund' : 'Refund received'} <b>{r.ref}</b>, {fmtDate(r.date)}{r.cancelled ? `, cancelled ${fmtDate(r.cancelled.at)}: ${r.cancelled.reason}` : ''}</span>
              <span className="payr"><b>{m(r.amount)}</b><a className="btn" href={`/print/refund/${c.id}/${r.id}`} target="_blank" rel="noopener">Print</a>
                {!r.cancelled && <button className="btn ghost" disabled={busy} onClick={() => { const reason = window.prompt(`Cancel ${r.ref}? The credit becomes available again.\n\nReason:`); if (reason && reason.trim().length >= 3) run(() => api(`/api/credits/${c.id}/refunds/${r.id}/cancel`, 'POST', { reason: reason.trim() }), 'Refund cancelled.'); }}>Cancel</button>}</span>
            </div>))}
          {c.available > 0.004 && (
            <div className="addrow" style={{ marginTop: 4 }}>
              <button className="btn primary" disabled={busy} onClick={() => setRefund({ c, date: todayISO(), amount: c.available, method: 'transfer', accountId: accounts[0]?.id ?? '' })}>{cust ? 'Refund the customer…' : 'Record refund received…'}</button>
              {targets.length > 0 && <button className="btn" disabled={busy} onClick={() => setAlloc({ c, docId: targets[0].id, amount: Math.min(c.available, targets[0].balance) })}>Apply to another {cust ? 'invoice' : 'bill'}…</button>}
            </div>)}
        </div>))}

      {make && (
        <Modal title={cust ? 'New credit note' : 'Record the supplier’s credit note'} onClose={() => setMake(null)}>
          <p className="hint" style={{ marginTop: 0 }}>{cust ? 'Credit what you’re giving back. A cancellation fee you keep stays as revenue: don’t include it here.' : 'Enter what the supplier credits you.'} Up to {m(left)} of {docRef} can still be credited.</p>
          <div className="grid">
            <label className="fld" htmlFor="cn-d"><span>Date</span><DateInput id="cn-d" value={make.date} onChange={(v) => setMake({ ...make, date: v })} /></label>
            {!cust && <label className="fld" htmlFor="cn-t"><span>Supplier’s credit note number</span><input id="cn-t" value={make.theirRef} onChange={(e) => setMake({ ...make, theirRef: e.target.value })} /></label>}
            <label className="fld wide" htmlFor="cn-r"><span>Reason</span><input id="cn-r" value={make.reason} onChange={(e) => setMake({ ...make, reason: e.target.value })} placeholder={cust ? 'Trip cancelled by the customer' : 'Hotel night not used'} /></label>
          </div>
          <div className="table-wrap"><table className="lines">
            <thead><tr><th><span className="sr">Include</span></th><th>Line</th><th className="num">VAT</th><th className="num">Amount to credit ({currency}, excl. VAT)</th></tr></thead>
            <tbody>{make.lines.map((l, i) => (
              <tr key={l.id}><td><input type="checkbox" aria-label={`Include ${l.desc}`} checked={l.on} onChange={(e) => setMake({ ...make, lines: make.lines.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)) })} /></td>
                <td>{l.desc}</td><td className="num">{l.vat}%</td>
                <td className="num"><input className="w-num" type="number" min={0} step="0.01" aria-label={`Amount for ${l.desc}`} value={l.amount} disabled={!l.on} onChange={(e) => setMake({ ...make, lines: make.lines.map((x, j) => (j === i ? { ...x, amount: parseFloat(e.target.value) || 0 } : x)) })} /></td></tr>))}
            </tbody></table></div>
          <p style={{ textAlign: 'right' }}>Credit note total, VAT included: <b>{m(mt.total)}</b></p>
          <div className="dlg-actions"><button className="btn" onClick={() => setMake(null)}>Cancel</button>
            <button className="btn primary" disabled={busy || mt.total <= 0 || make.reason.trim().length < 2} onClick={async () => { if (await run(() => api(`/api/${cust ? 'invoices' : 'purchases'}/${docId}/credit`, 'POST', { date: make.date, reason: make.reason, theirRef: make.theirRef, lines: chosen.filter((l) => l.amount > 0).map(({ on, ...l }) => { void on; return l; }) }), 'Credit note created.')) setMake(null); }}>Create credit note</button></div>
        </Modal>
      )}
      {refund && (
        <Modal title={cust ? `Refund on ${refund.c.number}` : `Refund received on ${refund.c.number}`} onClose={() => setRefund(null)}>
          <div className="grid">
            <label className="fld" htmlFor="rf-a"><span>Amount ({currency}), up to {m(refund.c.available)}</span><input id="rf-a" type="number" min={0} step="0.01" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: parseFloat(e.target.value) || 0 })} /></label>
            <label className="fld" htmlFor="rf-d"><span>Date</span><DateInput id="rf-d" value={refund.date} onChange={(v) => setRefund({ ...refund, date: v })} /></label>
            <label className="fld" htmlFor="rf-m"><span>Method</span><select id="rf-m" value={refund.method} onChange={(e) => setRefund({ ...refund, method: e.target.value })}>{PAY_METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="fld" htmlFor="rf-acc"><span>{cust ? 'Paid from' : 'Received into'}</span><select id="rf-acc" value={refund.accountId} onChange={(e) => setRefund({ ...refund, accountId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          </div>
          <div className="dlg-actions"><button className="btn" onClick={() => setRefund(null)}>Cancel</button>
            <button className="btn primary" disabled={busy || refund.amount <= 0} onClick={async () => { if (await run(() => api(`/api/credits/${refund.c.id}/refund`, 'POST', { date: refund.date, amount: refund.amount, method: refund.method, accountId: refund.accountId }), 'Refund recorded.')) setRefund(null); }}>Record refund</button></div>
        </Modal>
      )}
      {alloc && (
        <Modal title={`Apply ${alloc.c.number} to another ${cust ? 'invoice' : 'bill'}`} onClose={() => setAlloc(null)}>
          <div className="grid">
            <label className="fld" htmlFor="al-t"><span>{cust ? 'Open invoice' : 'Open bill'}</span><select id="al-t" value={alloc.docId} onChange={(e) => { const t = targets.find((x) => x.id === e.target.value)!; setAlloc({ ...alloc, docId: t.id, amount: Math.min(alloc.c.available, t.balance) }); }}>{targets.map((t) => <option key={t.id} value={t.id}>{t.ref}, {m(t.balance)} due</option>)}</select></label>
            <label className="fld" htmlFor="al-a"><span>Amount ({currency})</span><input id="al-a" type="number" min={0} step="0.01" value={alloc.amount} onChange={(e) => setAlloc({ ...alloc, amount: parseFloat(e.target.value) || 0 })} /></label>
          </div>
          <div className="dlg-actions"><button className="btn" onClick={() => setAlloc(null)}>Cancel</button>
            <button className="btn primary" disabled={busy || alloc.amount <= 0} onClick={async () => { if (await run(() => api(`/api/credits/${alloc.c.id}/allocate`, 'POST', { docId: alloc.docId, amount: alloc.amount }), 'Credit applied.')) setAlloc(null); }}>Apply</button></div>
        </Modal>
      )}
    </section>
  );
}
