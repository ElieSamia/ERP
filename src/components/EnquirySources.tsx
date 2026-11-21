'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { fmtDateTime } from '@/lib/constants';
import type { Source } from '@/lib/enquiries';
import { Modal } from './Modal';
import { useToast } from './Toast';

type Res = { sources: Source[]; newKey?: { id: string; key: string } };
type Log = { at: string; status: number; requestId: string; result: string; ref: string }[];

/** Who may send enquiries to the ERP: your website's server and partners, each with its own key. */
export function EnquirySources({ initial, endpoint }: { initial: Res; endpoint: string }) {
  const [list, setList] = useState(initial.sources);
  const [shown, setShown] = useState(initial.newKey ?? null);
  const [name, setName] = useState('');
  const [log, setLog] = useState<{ name: string; rows: Log } | null>(null);
  const [busy, setBusy] = useState('');
  const toast = useToast();
  const apply = (r: Res) => { setList(r.sources); if (r.newKey) setShown(r.newKey); };
  async function call(url: string, method: 'POST' | 'PATCH', body?: unknown, key = url) {
    setBusy(key);
    try { apply(await api<Res>(url, method, body)); } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(''); }
  }
  const patch = (s: Source, ch: Partial<Source>) => { const n = { ...s, ...ch }; return call(`/api/enquiry/sources/${s.id}`, 'PATCH', { name: n.name, active: n.active, notify: n.notify, autoReply: n.autoReply }, s.id); };
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast('Copied.'));
  return (
    <section className="sheet" style={{ marginBottom: 16 }} id="enquiry-sources">
      <h2>Enquiry sources</h2>
      <p className="hint" style={{ marginTop: 0 }}>Your website’s server and partners send enquiries to <code className="key">{endpoint}</code> <button className="linkbtn" onClick={() => copy(endpoint)}>Copy</button> with their key in the header <code className="key">Authorization: Bearer &lt;key&gt;</code>. Each request becomes an opportunity in New; the same request ID is never created twice.</p>
      {shown && (
        <div className="banner" style={{ display: 'block', margin: '10px 0' }}>
          <b>Key for {list.find((s) => s.id === shown.id)?.name ?? 'the source'}.</b> Copy it now: it won’t be shown again. Give it to the developer to store on the server (for example as ERP_ENQUIRY_KEY), never in website code.
          <div className="addrow"><code className="key" style={{ wordBreak: 'break-all' }}>{shown.key}</code><button className="btn" onClick={() => copy(shown.key)}>Copy key</button><button className="btn ghost" onClick={() => setShown(null)}>I’ve saved it</button></div>
        </div>
      )}
      <div className="table-wrap"><table className="lines">
        <thead><tr><th>Source</th><th>Key</th><th>On</th><th>Team email</th><th>Auto-reply to customer</th><th className="num">Requests</th><th>Last request</th><th><span className="sr">Actions</span></th></tr></thead>
        <tbody>{list.map((s) => (
          <tr key={s.id}><td><b>{s.name}</b></td><td><code className="key">{s.keyHint}</code></td>
            <td><input type="checkbox" aria-label={`${s.name} on`} checked={s.active} onChange={(e) => patch(s, { active: e.target.checked })} disabled={busy !== ''} /></td>
            <td><input type="checkbox" aria-label={`${s.name} team email`} checked={s.notify} onChange={(e) => patch(s, { notify: e.target.checked })} disabled={busy !== ''} /></td>
            <td><input type="checkbox" aria-label={`${s.name} auto-reply`} checked={s.autoReply} onChange={(e) => patch(s, { autoReply: e.target.checked })} disabled={busy !== ''} /></td>
            <td className="num">{s.count}</td><td>{s.lastAt ? fmtDateTime(s.lastAt) : <span className="muted">Never</span>}</td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <button className="btn" onClick={async () => setLog({ name: s.name, rows: await api<Log>(`/api/enquiry/sources/${s.id}/log`) })}>Log</button>{' '}
              <button className="btn" disabled={busy !== ''} onClick={() => { if (window.confirm(`Make a new key for ${s.name}? The current key stops working immediately.`)) call(`/api/enquiry/sources/${s.id}/key`, 'POST', undefined, `k${s.id}`); }}>New key</button></td></tr>))}
        </tbody></table></div>
      <p className="hint">Your website already emails the agency and the customer, so <b>Website</b> starts with both ERP emails off. A partner without its own emails can have them on.</p>
      <div className="addrow">
        <input className="sel" placeholder="New source, for example Partner: Cedar Wings" value={name} onChange={(e) => setName(e.target.value)} aria-label="New source name" />
        <button className="btn" disabled={busy !== '' || name.trim().length < 2} onClick={() => { call('/api/enquiry/sources', 'POST', { name }, 'add'); setName(''); }}>Add source</button>
      </div>
      {log && (
        <Modal title={`Requests from ${log.name}`} onClose={() => setLog(null)}>
          {log.rows.length === 0 ? <p className="muted">No requests yet.</p> : (
            <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}><table className="lines">
              <thead><tr><th>When</th><th>Request</th><th>Result</th></tr></thead>
              <tbody>{log.rows.map((r, i) => <tr key={i}><td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.at)}</td><td>{r.requestId || '—'}{r.ref && <span className="muted" style={{ display: 'block', fontSize: 12 }}>{r.ref}</span>}</td>
                <td><span className={`badge ${r.status < 300 ? 'b-green' : r.status === 429 ? 'b-amber' : 'b-red'}`}>{r.status}</span> {r.result}</td></tr>)}</tbody></table></div>
          )}
          <p className="hint">Kept for 30 days. A 400 names the field your developer needs to fix.</p>
        </Modal>
      )}
    </section>
  );
}
