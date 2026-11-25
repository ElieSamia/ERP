'use client';
import { useRef, useState } from 'react';
import { api } from '@/lib/client';
import { fmtDateTime } from '@/lib/constants';
import type { BackupRow } from '@/lib/backup';
import { Modal } from './Modal';
import { useToast } from './Toast';

type Sec = { key: string; label: string; note?: string };
type State = { backups: BackupRow[]; scheduled: boolean; lastDaily: string };
type Preview = { company: string; exportedAt: string; exportedBy: string; sections: (Sec & { items: number })[] };
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const KIND: Record<string, string> = { daily: 'Daily', manual: 'Manual', 'before-restore': 'Before a restore' };

async function download(url: string, init: RequestInit, fallback: string) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Download failed.');
  const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? fallback;
  const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Export and import of settings, and whole-database backups with a daily schedule. */
export function BackupPanel({ sections, initial }: { sections: Sec[]; initial: State }) {
  const [st, setSt] = useState(initial);
  const [pick, setPick] = useState<Set<string>>(new Set(sections.map((s) => s.key)));
  const [file, setFile] = useState<{ text: string; preview: Preview; pick: Set<string> } | null>(null);
  const [restore, setRestore] = useState<BackupRow | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState('');
  const fileIn = useRef<HTMLInputElement>(null);
  const bakIn = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const stale = !st.lastDaily || Date.now() - Date.parse(st.lastDaily) > 26 * 3600e3;
  const run = async (k: string, fn: () => Promise<void>) => { setBusy(k); try { await fn(); } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(''); } };
  const reload = async () => setSt(await api<State>('/api/backup'));
  const toggle = (s: Set<string>, k: string) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; };
  return (
    <section className="sheet" style={{ marginBottom: 16 }} id="backups">
      <h2>Backups and settings transfer</h2>

      <h3 className="sub3">Daily backups</h3>
      <p className={st.scheduled && !stale ? 'hint' : 'banner'} style={{ display: 'block', marginTop: 0 }}>
        {st.scheduled ? <>The whole database is backed up every night at 01:00 UTC. {st.lastDaily ? <>Last daily backup: <b>{fmtDateTime(st.lastDaily)}</b>.</> : 'No daily backup yet: the first one runs tonight.'}{stale && st.lastDaily ? ' That’s more than a day ago: check the Cron Jobs page in Vercel.' : ''}</>
          : <>The daily schedule isn’t switched on. In Vercel → Settings → Environment Variables, add <code className="key">CRON_SECRET</code> (any long random text) and redeploy.</>}
      </p>
      <p className="hint">Backups are compressed and encrypted with this ERP’s AUTH_SECRET, and kept in your private file storage: 14 daily, one a week for 8 weeks, and the last 10 manual ones. Download one now and then and keep it somewhere else, for example your computer or company drive. Uploaded files (tickets, vouchers) stay in file storage and aren’t part of the backup.</p>
      <div className="addrow">
        <button className="btn primary" disabled={busy !== ''} onClick={() => run('now', async () => { const b = await api<BackupRow>('/api/backup', 'POST'); toast(`Backed up: ${b.docs} records.`); await reload(); })}>{busy === 'now' ? 'Backing up…' : 'Back up now'}</button>
        <button className="btn" disabled={busy !== ''} onClick={() => bakIn.current?.click()}>Upload a backup file…</button>
        <input ref={bakIn} type="file" accept=".bak" className="sr" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run('up', async () => { const fd = new FormData(); fd.append('file', f); const r = await fetch('/api/backup/upload', { method: 'POST', body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setSt({ ...st, backups: j.backups }); toast('Backup file added to the list. Use Restore on it if needed.'); }); }} />
      </div>
      {st.backups.length > 0 && (
        <div className="table-wrap"><table className="lines">
          <thead><tr><th>When</th><th>Type</th><th className="num">Records</th><th className="num">Size</th><th>By</th><th><span className="sr">Actions</span></th></tr></thead>
          <tbody>{st.backups.map((b) => (
            <tr key={b.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(b.at)}</td><td>{KIND[b.kind] ?? b.kind}</td><td className="num">{b.docs.toLocaleString()}</td><td className="num">{size(b.size)}</td><td>{b.by}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn" disabled={busy !== ''} onClick={() => run(`d${b.id}`, () => download(`/api/backup/${b.id}/download`, {}, b.name))}>Download</button>{' '}
                <button className="btn ghost" disabled={busy !== ''} onClick={() => { setRestore(b); setTyped(''); }}>Restore…</button></td></tr>))}
          </tbody></table></div>
      )}

      <h3 className="sub3">Export settings</h3>
      <p className="hint" style={{ marginTop: 0 }}>Everything you set up, in one file, to load into a fresh database (for example when going live). Business data isn’t included. Saved passwords and keys stay encrypted and work only in an ERP with the same AUTH_SECRET.</p>
      <div className="setsec">{sections.map((s) => <label key={s.key} className="tgl"><input type="checkbox" checked={pick.has(s.key)} onChange={() => setPick(toggle(pick, s.key))} /> {s.label}{s.note && <small className="muted"> {s.note}</small>}</label>)}</div>
      <div className="addrow"><button className="btn" disabled={busy !== '' || !pick.size} onClick={() => run('exp', () => download('/api/backup/settings/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sections: [...pick] }) }, 'erp-settings.json'))}>{busy === 'exp' ? 'Preparing…' : 'Download settings file'}</button></div>

      <h3 className="sub3">Import settings</h3>
      <p className="hint" style={{ marginTop: 0 }}>Load a settings file exported from this ERP. You see what it contains and choose the sections before anything changes.</p>
      <div className="addrow"><button className="btn" disabled={busy !== ''} onClick={() => fileIn.current?.click()}>Choose a settings file…</button>
        <input ref={fileIn} type="file" accept=".json,application/json" className="sr" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run('pv', async () => { const text = await f.text(); const r = await fetch('/api/backup/settings/preview', { method: 'POST', body: text }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setFile({ text, preview: j, pick: new Set(j.sections.map((s: Sec) => s.key)) }); }); }} /></div>

      {file && (
        <Modal title="Import settings" onClose={() => setFile(null)}>
          <p style={{ marginTop: 0 }}>From <b>{file.preview.company || 'an ERP'}</b>, exported {fmtDateTime(file.preview.exportedAt)} by {file.preview.exportedBy}. Choose what to import; it replaces the current settings in those sections.</p>
          <div className="setsec">{file.preview.sections.map((s) => <label key={s.key} className="tgl"><input type="checkbox" checked={file.pick.has(s.key)} onChange={() => setFile({ ...file, pick: toggle(file.pick, s.key) })} /> {s.label} <span className="muted">({s.items})</span>{s.note && <small className="muted"> {s.note}</small>}</label>)}</div>
          <div className="dlg-actions"><button className="btn" onClick={() => setFile(null)}>Cancel</button>
            <button className="btn primary" disabled={busy !== '' || !file.pick.size} onClick={() => run('imp', async () => { const r = await api<{ imported: string[] }>('/api/backup/settings/import', 'POST', { file: file.text, sections: [...file.pick] }); setFile(null); toast(`Imported: ${r.imported.length} section${r.imported.length === 1 ? '' : 's'}. Reloading…`); setTimeout(() => location.reload(), 1200); })}>{busy === 'imp' ? 'Importing…' : 'Import'}</button></div>
        </Modal>
      )}
      {restore && (
        <Modal title="Restore the whole database" onClose={() => setRestore(null)}>
          <p style={{ marginTop: 0 }}>This puts <b>everything</b> back as it was on <b>{fmtDateTime(restore.at)}</b>: contacts, bookings, invoices, accounting, settings and users. Anything entered since then is replaced. A backup of the current state is taken first, so this can be undone.</p>
          <label className="fld" htmlFor="rs-c"><span>Type RESTORE to confirm</span><input id="rs-c" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></label>
          <div className="dlg-actions"><button className="btn" onClick={() => setRestore(null)}>Cancel</button>
            <button className="btn danger" disabled={busy !== '' || typed !== 'RESTORE'} onClick={() => run('rs', async () => { const r = await api<{ docs: number; safety: string }>(`/api/backup/${restore.id}/restore`, 'POST', { confirm: typed }); setRestore(null); toast(`Restored ${r.docs} records. Reloading…`); setTimeout(() => location.reload(), 1500); })}>{busy === 'rs' ? 'Restoring…' : 'Restore'}</button></div>
        </Modal>
      )}
    </section>
  );
}
