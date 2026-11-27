'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { fmtDateTime } from '@/lib/constants';
import { DateInput } from './DateInput';

type Row = { id: string; at: string; kind: string; action: string; who: string; target: string; detail: string; ip: string };
const KINDS: [string, string][] = [['', 'All types'], ['sign-in', 'Sign-ins'], ['denied', 'Access refused'], ['security', 'Two-step sign-in'], ['users', 'Users and roles'],
  ['settings', 'Settings'], ['backup', 'Backups'], ['finance', 'Cancellations and credit notes'], ['reservation', 'Reservations'], ['delete', 'Deletions']];
const BADGE: Record<string, string> = { denied: 'b-red', 'sign-in': 'b-blue', security: 'b-amber', users: 'b-accent', backup: 'b-amber', delete: 'b-red', finance: 'b-amber' };

/** Who signed in, who was refused, and every sensitive change: kept a year, exportable for Excel. */
export function AuditPanel() {
  const [f, setF] = useState({ kind: '', who: '', from: '', to: '', q: '' });
  const [data, setData] = useState<{ rows: Row[]; people: string[] } | null>(null);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  useEffect(() => { const t = setTimeout(() => api<{ rows: Row[]; people: string[] }>(`/api/audit?${qs}`).then(setData).catch(() => null), 250); return () => clearTimeout(t); }, [qs]);
  const failed = (data?.rows ?? []).filter((r) => r.kind === 'sign-in' && /Wrong|unknown|blocked|deactivated/i.test(r.action)).length;
  return (
    <section className="sheet" id="audit">
      <div className="cp" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Security audit log</h2>
        <div className="cp-actions"><a className="btn" href={`/api/audit?${qs}${qs ? '&' : ''}format=csv`}>Download for Excel</a></div></div>
      <p className="hint" style={{ marginTop: 0 }}>Sign-ins and failed attempts (staff and portal), access refused by a role, and every change to settings, users, roles, backups, reservations, cancelled payments, credit notes and deletions. Kept for one year.</p>
      <div className="crmf-panel" style={{ marginBottom: 10 }}>
        <label className="fld" htmlFor="au-k"><span>Type</span><select id="au-k" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="fld" htmlFor="au-w"><span>Person</span><select id="au-w" value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })}><option value="">Everyone</option>{(data?.people ?? []).map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
        <label className="fld" htmlFor="au-f"><span>From</span><DateInput id="au-f" value={f.from} onChange={(v) => setF({ ...f, from: v })} /></label>
        <label className="fld" htmlFor="au-t"><span>To</span><DateInput id="au-t" value={f.to} onChange={(v) => setF({ ...f, to: v })} /></label>
        <label className="fld" htmlFor="au-q"><span>Search</span><input id="au-q" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Email, IP address, invoice…" /></label>
      </div>
      {failed > 0 && <p className="banner" style={{ display: 'block' }}>{failed} failed sign-in attempt{failed === 1 ? '' : 's'} in this list.</p>}
      {!data ? <p className="muted">Loading…</p> : data.rows.length === 0 ? <p className="muted">Nothing recorded for these filters.</p> : (
        <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}><table className="lines">
          <thead><tr><th>When</th><th>Type</th><th>What</th><th>Who</th><th>On</th><th>IP address</th></tr></thead>
          <tbody>{data.rows.map((r) => (
            <tr key={r.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.at)}</td><td><span className={`badge ${BADGE[r.kind] ?? ''}`}>{KINDS.find(([k]) => k === r.kind)?.[1] ?? r.kind}</span></td>
              <td>{r.action}{r.detail && <small className="muted" style={{ display: 'block', maxWidth: 420 }}>{r.detail}</small>}</td><td>{r.who || '—'}</td><td style={{ fontSize: 13 }}>{r.target}</td><td style={{ fontSize: 13 }}>{r.ip}</td></tr>))}
          </tbody></table></div>
      )}
      <p className="hint">Showing the latest 200 for these filters; the Excel download includes up to 20,000.</p>
    </section>
  );
}
