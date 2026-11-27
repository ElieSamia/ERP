'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/client';
import { useToast } from './Toast';

type Preview = { token: string; name: string; headers: string[]; sample: string[][]; total: number; mapping: Record<string, number> };
type Result = { created: number; updated: number; skipped: number; problems: { row: number; reason: string }[] };

/** Import customers and suppliers: upload, match columns, import, with a clear report. */
export function ContactImport({ fields }: { fields: [string, string][] }) {
  const [p, setP] = useState<Preview | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});
  const [dflt, setDflt] = useState('customer');
  const [dup, setDup] = useState<'skip' | 'update'>('skip');
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function upload(f: File) {
    setBusy(true); setRes(null);
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await fetch('/api/contacts/import/preview', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setP(j); setMap(j.mapping);
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function run() {
    if (!p) return;
    setBusy(true);
    try { setRes(await api<Result>('/api/contacts/import/run', 'POST', { token: p.token, mapping: map, defaultType: dflt, onDuplicate: dup })); setP(null); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  return (
    <section className="sheet">
      <h2>Import customers and suppliers</h2>
      {!p && !res && <>
        <p className="hint" style={{ marginTop: 0 }}>An Excel (.xlsx) or CSV file with a header row, up to 5,000 rows. Only a name is required; email and phone are used to spot people you already have.</p>
        <label className="btn primary" style={{ display: 'inline-block' }}>{busy ? 'Reading…' : 'Choose a file…'}<input type="file" accept=".xlsx,.csv,.txt" className="sr" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} /></label>
      </>}
      {p && <>
        <p style={{ marginTop: 0 }}><b>{p.name}</b>: {p.total} row{p.total === 1 ? '' : 's'}. Match each field to a column of the file (we guessed from the headers).</p>
        <div className="crmf-panel">
          {fields.map(([k, l]) => (
            <label key={k} className="fld" htmlFor={`im-${k}`}><span>{l}{k === 'name' ? ' (required)' : ''}</span>
              <select id={`im-${k}`} value={map[k] ?? -1} onChange={(e) => { const v = Number(e.target.value); const n = { ...map }; if (v < 0) delete n[k]; else n[k] = v; setMap(n); }}>
                <option value={-1}>Not in the file</option>{p.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}</select></label>))}
          <label className="fld" htmlFor="im-dt"><span>Type when the file doesn’t say</span><select id="im-dt" value={dflt} onChange={(e) => setDflt(e.target.value)}>
            <option value="customer">Individual customer</option><option value="agency">Agency</option><option value="corporate">Corporate</option><option value="supplier">Supplier</option></select></label>
          <label className="fld" htmlFor="im-du"><span>Already in the ERP (same email or phone)</span><select id="im-du" value={dup} onChange={(e) => setDup(e.target.value as 'skip' | 'update')}>
            <option value="skip">Skip them</option><option value="update">Update them with the file’s details</option></select></label>
        </div>
        <h3 className="sub3">First rows, as they’ll be read</h3>
        <div className="table-wrap"><table className="lines">
          <thead><tr>{fields.filter(([k]) => map[k] !== undefined).map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
          <tbody>{p.sample.map((r, i) => <tr key={i}>{fields.filter(([k]) => map[k] !== undefined).map(([k]) => <td key={k}>{r[map[k]]}</td>)}</tr>)}</tbody>
        </table></div>
        <p className="hint">Email offers are set to “no” unless the file has a column saying the person agreed. WhatsApp offers always start as “no”.</p>
        <div className="addrow"><button className="btn" onClick={() => setP(null)}>Choose another file</button>
          <button className="btn primary" disabled={busy || map.name === undefined} onClick={run}>{busy ? 'Importing…' : `Import ${p.total} row${p.total === 1 ? '' : 's'}`}</button></div>
      </>}
      {res && <>
        <div className="kpis">
          <div className="kpi"><span>Created</span><b>{res.created}</b></div><div className="kpi"><span>Updated</span><b>{res.updated}</b></div>
          <div className="kpi"><span>Already there, skipped</span><b>{res.skipped}</b></div><div className="kpi"><span>Rows with problems</span><b>{res.problems.length}</b></div>
        </div>
        {res.problems.length > 0 && <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto', marginTop: 10 }}><table className="lines">
          <thead><tr><th>Row in the file</th><th>Problem</th></tr></thead>
          <tbody>{res.problems.map((x, i) => <tr key={i}><td>{x.row}</td><td>{x.reason}</td></tr>)}</tbody></table></div>}
        <div className="addrow"><Link className="btn primary" href="/contacts">Open Contacts</Link><button className="btn" onClick={() => setRes(null)}>Import another file</button></div>
      </>}
    </section>
  );
}
