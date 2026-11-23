'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { CONTACT_TYPES, TYPE_BADGE, label } from '@/lib/constants';
import type { Contact } from '@/lib/types';
import { Modal } from './Modal';
import { useToast } from './Toast';

/** The contacts list with selection: tick contacts (or all shown), then tag them or add them to an audience. */
export function ContactsTable({ rows, audiences, tags }: { rows: Contact[]; audiences: { id: string; name: string }[]; tags: string[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dlg, setDlg] = useState<null | 'addTag' | 'removeTag' | 'addToAudience'>(null);
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };
  async function run() {
    if (!dlg) return;
    setBusy(true);
    try {
      const r = await api<{ changed: number }>('/api/contacts/bulk', 'POST', { ids: [...sel], action: dlg, tag: val, audienceId: val });
      toast(dlg === 'addToAudience' ? `${sel.size} contact${sel.size === 1 ? '' : 's'} added to ${audiences.find((a) => a.id === val)?.name}.` : `${dlg === 'addTag' ? 'Tagged' : 'Untagged'} ${r.changed} contact${r.changed === 1 ? '' : 's'}.`);
      setDlg(null); setVal(''); setSel(new Set()); router.refresh();
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  return (
    <>
      {sel.size > 0 && (
        <div className="tray" style={{ position: 'sticky', top: 64, marginTop: 0, marginBottom: 10 }}>
          <span><b>{sel.size}</b> selected</span><span style={{ flex: 1 }} />
          <button className="btn" onClick={() => setSel(new Set())}>Clear</button>
          <button className="btn" onClick={() => { setDlg('removeTag'); setVal(''); }}>Remove tag…</button>
          <button className="btn" onClick={() => { setDlg('addTag'); setVal(''); }}>Add tag…</button>
          <button className="btn primary" onClick={() => { setDlg('addToAudience'); setVal(audiences[0]?.id ?? ''); }}>Add to audience…</button>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th style={{ width: 34 }}><input type="checkbox" aria-label="Select all shown" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} /></th><th>Name</th><th>Type</th><th>City</th><th>Email</th><th>Phone</th><th>Offers</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className={sel.has(c.id) ? 'picked' : ''}>
                <td><input type="checkbox" aria-label={`Select ${c.name}`} checked={sel.has(c.id)} onChange={() => toggle(c.id)} /></td>
                <td><Link href={`/contacts/${c.id}`}><strong>{c.name}</strong></Link>{(c.tags ?? []).length > 0 && <span style={{ display: 'block', marginTop: 2 }}>{(c.tags ?? []).map((t) => <span key={t} className="badge b-accent" style={{ marginRight: 4 }}>{t}</span>)}</span>}</td>
                <td><span className={`badge ${TYPE_BADGE[c.type]}`}>{label(CONTACT_TYPES, c.type)}</span></td>
                <td>{c.city}</td><td>{c.email}</td><td>{c.phone}</td>
                <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{c.type === 'supplier' ? '' : <>{c.marketing === 'yes' ? 'Email ✓' : <span className="muted">Email ✗</span>} · {c.waMarketing === 'yes' ? 'WhatsApp ✓' : <span className="muted">WhatsApp ✗</span>}</>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dlg && (
        <Modal title={dlg === 'addTag' ? 'Add a tag' : dlg === 'removeTag' ? 'Remove a tag' : 'Add to an audience'} onClose={() => setDlg(null)}>
          {dlg === 'addToAudience' ? (audiences.length ? <label className="fld" htmlFor="bk-a"><span>Audience</span><select id="bk-a" value={val} onChange={(e) => setVal(e.target.value)}>{audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            : <p className="muted">No audiences yet. Create one under Marketing → Audiences first.</p>)
            : <label className="fld" htmlFor="bk-t"><span>Tag</span><input id="bk-t" list="bk-tags" value={val} onChange={(e) => setVal(e.target.value)} placeholder="VIP, Honeymoon, Family…" autoFocus /><datalist id="bk-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist></label>}
          <p className="hint">{dlg === 'addToAudience' ? 'They’re always included in that audience, whatever its rules, as long as they can receive offers.' : `Applies to the ${sel.size} selected contact${sel.size === 1 ? '' : 's'}.`}</p>
          <div className="dlg-actions"><button className="btn" onClick={() => setDlg(null)}>Cancel</button><button className="btn primary" onClick={run} disabled={busy || !val.trim()}>{busy ? 'Working…' : 'Apply'}</button></div>
        </Modal>
      )}
    </>
  );
}
