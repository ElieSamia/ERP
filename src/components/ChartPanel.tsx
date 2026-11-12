'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { ACC_CLASSES, ACC_TYPES, label, type LedgerAccount } from '@/lib/constants';
import { useToast } from './Toast';

export function ChartPanel({ chart, balances, period }: { chart: LedgerAccount[]; balances: Record<string, string>; period: string }) {
  const [n, setN] = useState({ code: '', name: '', type: 'expense' });
  const [edit, setEdit] = useState<{ code: string; name: string } | null>(null);
  const toast = useToast();
  const router = useRouter();
  async function add() {
    try { await api('/api/accounting/accounts', 'POST', n); toast(`Account ${n.code} added.`); setN({ code: '', name: '', type: 'expense' }); router.refresh(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  async function rename() {
    if (!edit) return;
    try { await api(`/api/accounting/accounts/${edit.code}`, 'PATCH', { name: edit.name }); toast('Account renamed.'); setEdit(null); router.refresh(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  return (
    <>
      <section className="sheet" style={{ marginBottom: 16 }}>
        <h2>Add an account</h2>
        <div className="newacct">
          <label className="fld" htmlFor="na-code"><span>Code</span><input id="na-code" inputMode="numeric" placeholder="6271" value={n.code} onChange={(e) => setN({ ...n, code: e.target.value })} /></label>
          <label className="fld" htmlFor="na-name"><span>Name</span><input id="na-name" placeholder="Card processing fees" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} /></label>
          <label className="fld" htmlFor="na-type"><span>Type</span><select id="na-type" value={n.type} onChange={(e) => setN({ ...n, type: e.target.value })}>{ACC_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <button className="btn primary" onClick={add}>Add account</button>
        </div>
        <p className="hint">The first digit sets the class. A sub-account sorts under its parent, so 6271 sits under 627 Bank charges. Codes can’t change later; names can.</p>
      </section>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Account</th><th>Type</th><th className="num">Balance</th></tr></thead>
          <tbody>
            {Object.keys(ACC_CLASSES).map((k) => [
              <tr key={`c${k}`} className="grp"><td colSpan={4}>{ACC_CLASSES[k]}</td></tr>,
              ...chart.filter((a) => a.code.startsWith(k)).map((a) => (
                <tr key={a.code}>
                  <td><Link href={`/accounting/ledger/${a.code}?p=${period}`}><strong>{a.code}</strong></Link></td>
                  <td>{edit?.code === a.code ? (
                    <span className="mk"><input aria-label="Account name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /><button className="btn" onClick={rename}>Save</button><button className="btn" onClick={() => setEdit(null)}>Cancel</button></span>
                  ) : <button className="stagebtn" title="Rename" onClick={() => setEdit({ code: a.code, name: a.name })}>{a.name}</button>}</td>
                  <td className="muted">{label(ACC_TYPES, a.type)}</td>
                  <td className="num">{balances[a.code] ?? <span className="muted">0</span>}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </>
  );
}
