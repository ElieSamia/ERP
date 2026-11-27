'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { AREAS, type Level, type Role } from '@/lib/areas';
import { useToast } from './Toast';

const LEVELS: [Level, string][] = [['none', 'No access'], ['view', 'View'], ['edit', 'Edit']];

/** Roles: what each one can open (No access, View, Edit) per app, and whether costs and margins are visible. */
export function RolesPanel({ initial, counts }: { initial: Role[]; counts: Record<string, number> }) {
  const [roles, setRoles] = useState(initial);
  const [sel, setSel] = useState(initial[0]?.id ?? '');
  const [draft, setDraft] = useState<Role | null>(initial[0] ?? null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const cur = roles.find((r) => r.id === sel);
  const dirty = !!draft && !!cur && JSON.stringify(draft) !== JSON.stringify(cur);
  const choose = (id: string) => { setSel(id); setDraft(roles.find((r) => r.id === id) ?? null); };
  const run = async (fn: () => Promise<Role[]>, msg: string, pickId?: (rs: Role[]) => string) => {
    setBusy(true);
    try { const rs = await fn(); setRoles(rs); const id = pickId ? pickId(rs) : sel; setSel(id); setDraft(rs.find((r) => r.id === id) ?? null); toast(msg); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  };
  return (
    <section className="sheet" id="roles">
      <h2>Roles</h2>
      <p className="hint" style={{ marginTop: 0 }}>What each staff role can open. View lets people look without changing anything. Administrators always have everything, and only they see Settings, users, roles and the audit log.</p>
      <div className="chips" role="tablist" aria-label="Roles">{roles.map((r) => <button key={r.id} role="tab" aria-selected={r.id === sel} className={`chip ${r.id === sel ? 'on' : ''}`} onClick={() => choose(r.id)}>{r.name}{counts[r.id] ? ` (${counts[r.id]})` : ''}</button>)}
        <button className="chip" disabled={busy} onClick={() => { const name = window.prompt('Name of the new role (for example: Ticketing):'); if (name && name.trim().length >= 2) run(() => api<Role[]>('/api/roles', 'POST', { name: name.trim(), perms: Object.fromEntries(AREAS.map(([k]) => [k, 'none'])), costs: false }), 'Role created.', (rs) => rs.find((r) => r.name === name.trim())?.id ?? sel); }}>+ New role</button></div>
      {draft && (
        <>
          <label className="fld" htmlFor="ro-n" style={{ maxWidth: 320, marginTop: 10 }}><span>Role name</span><input id="ro-n" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <div className="table-wrap"><table className="lines">
            <thead><tr><th>App</th>{LEVELS.map(([, l]) => <th key={l} style={{ textAlign: 'center' }}>{l}</th>)}</tr></thead>
            <tbody>{AREAS.map(([k, l]) => (
              <tr key={k}><td>{l}</td>{LEVELS.map(([v, vl]) => <td key={v} style={{ textAlign: 'center' }}><input type="radio" name={`lv-${k}`} aria-label={`${l}: ${vl}`} checked={draft.perms[k] === v} onChange={() => setDraft({ ...draft, perms: { ...draft.perms, [k]: v } })} /></td>)}</tr>))}
            </tbody></table></div>
          <label className="tgl" style={{ margin: '10px 0' }}><input type="checkbox" checked={draft.costs} onChange={(e) => setDraft({ ...draft, costs: e.target.checked })} /> <b>See costs and margins</b>: supplier costs, markups and margins on bookings, the Rates desk, products and reports. Without it, only selling prices show, and service prices can’t be changed.</label>
          <div className="addrow">
            <button className="btn primary" disabled={busy || !dirty} onClick={() => run(() => api<Role[]>(`/api/roles/${draft.id}`, 'PATCH', { name: draft.name, perms: draft.perms, costs: draft.costs }), 'Role saved. It applies to its users within a few seconds.')}>Save role</button>
            {dirty && <button className="btn" onClick={() => setDraft(cur ?? null)}>Discard</button>}
            {draft.id !== 'staff-full' && <button className="btn ghost" disabled={busy} onClick={() => { if (window.confirm(`Delete the role ${draft.name}?`)) run(() => api<Role[]>(`/api/roles/${draft.id}`, 'DELETE'), 'Role deleted.', (rs) => rs[0]?.id ?? ''); }}>Delete role</button>}
          </div>
          {draft.id === 'staff-full' && <p className="hint">Staff without another role get this one, so it can be changed but not deleted.</p>}
        </>
      )}
    </section>
  );
}
