'use client';
import { useState } from 'react';
import { PAY_METHODS, fmtDate, label, money, todayISO, type PayAccount } from '@/lib/constants';
import type { Payment } from '@/lib/types';

/** Lists payments with their receipt or voucher, and records a new one. */
export function PaymentBox({ title, payments, accounts, balance, canPay, onPay, printHref, printLabel, emptyText }: {
  title: string; payments: Payment[]; accounts: PayAccount[]; balance: number; canPay: boolean;
  onPay: (p: { date: string; amount: number; method: string; accountId: string }) => Promise<void>;
  printHref: (p: Payment) => string; printLabel: string; emptyText: string;
}) {
  const [f, setF] = useState({ date: todayISO(), amount: balance, method: 'transfer', accountId: accounts[0]?.id ?? '' });
  const [busy, setBusy] = useState(false);
  const acc = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;
  async function submit() {
    setBusy(true);
    try { await onPay(f); setF({ ...f, amount: 0 }); } finally { setBusy(false); }
  }
  return (
    <section className="sheet">
      <h2>{title}</h2>
      {payments.length ? (
        <ul className="paylist">
          {payments.map((p) => (
            <li key={p.id}>
              <span><strong>{p.ref}</strong>, {fmtDate(p.date)}, {label(PAY_METHODS, p.method)}, {acc(p.accountId)}</span>
              <span className="payr"><b>{money(p.amount)}</b><a className="btn" href={printHref(p)} target="_blank" rel="noopener">{printLabel}</a></span>
            </li>
          ))}
        </ul>
      ) : <p className="muted" style={{ margin: 0 }}>{emptyText}</p>}
      {canPay && (
        <div className="payform">
          <label className="fld" htmlFor="pay-amount"><span>Amount (USD)</span><input id="pay-amount" type="number" min={0} step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: parseFloat(e.target.value) || 0 })} /></label>
          <label className="fld" htmlFor="pay-date"><span>Date</span><input id="pay-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label className="fld" htmlFor="pay-method"><span>Method</span><select id="pay-method" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{PAY_METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="fld" htmlFor="pay-acc"><span>Account</span><select id="pay-acc" value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</button>
        </div>
      )}
      {canPay && <p className="hint">Balance due: {money(balance)}. The receipt opens once the payment is saved.</p>}
    </section>
  );
}
