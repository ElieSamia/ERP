'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { fmtDateTime } from '@/lib/constants';
import type { Connection } from '@/lib/rates';
import type { RateKind } from '@/lib/rates/types';
import { Modal } from './Modal';
import { useToast } from './Toast';

type Prov = { id: string; name: string; kinds: RateKind[]; description: string; fields: { key: string; label: string; secret?: boolean; placeholder?: string }[] };
type Draft = { id?: string; provider: string; name: string; kinds: RateKind[]; mode: 'test' | 'live'; supplierId: string; active: boolean; credentials: Record<string, string> };
type Log = { at: string; op: string; ms: number; ok: boolean; summary: string; error: string }[];
const KL: Record<RateKind, string> = { flight: 'Flights', hotel: 'Hotels', transfer: 'Transfers', insurance: 'Insurance' };

export function ConnectionsPanel({ initial, providers, suppliers }: { initial: Connection[]; providers: Prov[]; suppliers: { id: string; name: string }[] }) {
  const [list, setList] = useState(initial);
  const [ed, setEd] = useState<Draft | null>(null);
  const [log, setLog] = useState<{ name: string; rows: Log } | null>(null);
  const [busy, setBusy] = useState('');
  const toast = useToast();
  const prov = (id: string) => providers.find((p) => p.id === id);
  async function save() {
    if (!ed) return;
    setBusy('save');
    try { setList(await api<Connection[]>(ed.id ? `/api/rates/connections/${ed.id}` : '/api/rates/connections', ed.id ? 'PATCH' : 'POST', ed)); setEd(null); toast('Connection saved.'); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(''); }
  }
  async function check(c: Connection) {
    setBusy(c.id);
    try { toast((await api<{ message: string }>(`/api/rates/connections/${c.id}/check`, 'POST')).message); } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(''); }
  }
  async function remove(c: Connection) {
    if (!window.confirm(`Remove ${c.name}? Existing bookings keep their services, but reservations made through it can no longer be changed from the ERP.`)) return;
    try { setList(await api<Connection[]>(`/api/rates/connections/${c.id}`, 'DELETE')); } catch (e) { toast((e as Error).message, 'err'); }
  }
  const p = ed ? prov(ed.provider) : undefined;
  return (
    <section className="sheet">
      <div className="cp" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Connections</h2>
        <div className="cp-actions"><button className="btn primary" onClick={() => { const d = providers[0]; setEd({ provider: d.id, name: d.name, kinds: d.kinds, mode: 'test', supplierId: '', active: true, credentials: {} }); }}>Add connection</button></div></div>
      <p className="hint" style={{ marginTop: 0 }}>Each connection is one provider account. Its results appear in the Rates desk, and services booked through it are bought from the supplier you link here, so costs land in Purchasing and Accounting under that supplier.</p>
      {list.length === 0 ? <p className="muted">No connections yet. Start with the Demo provider to try the desk; real providers are added as their APIs are connected.</p> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Connection</th><th>Sells</th><th>Mode</th><th>Supplier</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead>
          <tbody>{list.map((c) => (
            <tr key={c.id}><td><strong>{c.name}</strong><span className="muted" style={{ display: 'block', fontSize: 13 }}>{prov(c.provider)?.name ?? c.provider}</span></td>
              <td>{c.kinds.map((k) => KL[k]).join(', ')}</td><td><span className={`badge ${c.mode === 'live' ? 'b-green' : 'b-amber'}`}>{c.mode === 'live' ? 'Live' : 'Test'}</span></td>
              <td>{suppliers.find((s) => s.id === c.supplierId)?.name ?? <span className="muted">Not linked</span>}</td>
              <td>{c.active ? <span className="badge b-green">Active</span> : <span className="badge">Off</span>}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn" onClick={() => check(c)} disabled={busy !== ''}>{busy === c.id ? 'Checking…' : 'Check'}</button>{' '}
                <button className="btn" onClick={async () => setLog({ name: c.name, rows: await api<Log>(`/api/rates/connections/${c.id}/log`) })}>Call log</button>{' '}
                <button className="btn" onClick={() => setEd({ id: c.id, provider: c.provider, name: c.name, kinds: c.kinds, mode: c.mode, supplierId: c.supplierId, active: c.active, credentials: {} })}>Edit</button>
                <button className="icon-btn" aria-label={`Remove ${c.name}`} onClick={() => remove(c)}>×</button></td></tr>))}
          </tbody></table></div>
      )}
      {ed && (
        <Modal title={ed.id ? `Edit ${ed.name}` : 'Add a connection'} onClose={() => setEd(null)}>
          <div className="grid">
            {!ed.id && <label className="fld wide" htmlFor="cn-p"><span>Provider</span><select id="cn-p" value={ed.provider} onChange={(e) => { const n = prov(e.target.value)!; setEd({ ...ed, provider: n.id, name: n.name, kinds: n.kinds, credentials: {} }); }}>{providers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
            {p && <p className="hint wide" style={{ margin: 0 }}>{p.description}</p>}
            <label className="fld" htmlFor="cn-n"><span>Name</span><input id="cn-n" value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} /></label>
            <label className="fld" htmlFor="cn-m"><span>Mode</span><select id="cn-m" value={ed.mode} onChange={(e) => setEd({ ...ed, mode: e.target.value as Draft['mode'] })}><option value="test">Test (provider’s sandbox)</option><option value="live">Live (real bookings)</option></select></label>
            <label className="fld wide" htmlFor="cn-s"><span>Supplier in your contacts (costs are booked under it)</span><select id="cn-s" value={ed.supplierId} onChange={(e) => setEd({ ...ed, supplierId: e.target.value })}><option value="">Choose…</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <fieldset className="fld wide" style={{ border: 0, padding: 0, margin: 0 }}><legend><span>Use it for</span></legend><div className="chips">{(p?.kinds ?? []).map((k) => <label key={k} className="tgl"><input type="checkbox" checked={ed.kinds.includes(k)} onChange={(e) => setEd({ ...ed, kinds: e.target.checked ? [...ed.kinds, k] : ed.kinds.filter((x) => x !== k) })} /> {KL[k]}</label>)}</div></fieldset>
            {(p?.fields ?? []).map((f) => <label key={f.key} className="fld wide" htmlFor={`cn-${f.key}`}><span>{f.label}{ed.id ? ' (leave empty to keep)' : ''}</span><input id={`cn-${f.key}`} type={f.secret ? 'password' : 'text'} autoComplete="off" placeholder={f.placeholder} value={ed.credentials[f.key] ?? ''} onChange={(e) => setEd({ ...ed, credentials: { ...ed.credentials, [f.key]: e.target.value } })} /></label>)}
            {p && p.fields.length === 0 && <p className="hint wide" style={{ margin: 0 }}>This provider needs no credentials.</p>}
          </div>
          <label className="tgl" style={{ marginTop: 8 }}><input type="checkbox" checked={ed.active} onChange={(e) => setEd({ ...ed, active: e.target.checked })} /> Active (included in searches)</label>
          <p className="hint">Credentials are stored encrypted and never shown again.</p>
          <div className="dlg-actions"><button className="btn" onClick={() => setEd(null)}>Cancel</button><button className="btn primary" onClick={save} disabled={busy !== ''}>{busy === 'save' ? 'Saving…' : 'Save'}</button></div>
        </Modal>
      )}
      {log && (
        <Modal title={`Call log: ${log.name}`} onClose={() => setLog(null)}>
          {log.rows.length === 0 ? <p className="muted">No calls yet.</p> : (
            <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}><table className="lines">
              <thead><tr><th>When</th><th>Call</th><th className="num">Time</th><th>Result</th></tr></thead>
              <tbody>{log.rows.map((r, i) => <tr key={i}><td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.at)}</td><td>{r.op}<span className="muted" style={{ display: 'block', fontSize: 12 }}>{r.summary}</span></td><td className="num">{r.ms} ms</td><td>{r.ok ? <span className="badge b-green">OK</span> : <><span className="badge b-red">Error</span><span className="muted" style={{ display: 'block', fontSize: 12 }}>{r.error}</span></>}</td></tr>)}</tbody>
            </table></div>
          )}
          <p className="hint">Kept for 30 days. Useful when talking to the provider’s support.</p>
        </Modal>
      )}
    </section>
  );
}
