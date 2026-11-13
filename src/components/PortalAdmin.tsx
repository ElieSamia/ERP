'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { PERM_DEFS, fmtDateTime, roleSummary, type Perms, type PortalRole, type PortalSettings } from '@/lib/constants';
import type { PortalAccountUser } from '@/lib/types';
import { Modal } from './Modal';
import { TextField, TextArea, SelectField, NumberField } from './Fields';
import { useToast } from './Toast';

function LinkBox({ url, onClose, name }: { url: string; onClose: () => void; name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="Invitation link" onClose={onClose}>
      <p style={{ marginTop: 0 }}>Send this link to {name}. It lets them set their own password, works once and expires in 7 days.</p>
      <div className="mk"><input readOnly value={url} aria-label="Invitation link" onFocus={(e) => e.target.select()} /><button className="btn" onClick={async () => { await navigator.clipboard.writeText(url).catch(() => null); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</button></div>
      <p className="hint">Send it by email or WhatsApp yourself. Automatic invitation emails come with the email provider in a later phase.</p>
      <div className="dlg-actions"><button className="btn primary" onClick={onClose}>Done</button></div>
    </Modal>
  );
}

/** Portal users of one account, managed by your staff. */
export function PortalUsersPanel({ contactId, contactName, initial, roles, endpoint = '/api/b2b/users', selfId }: {
  contactId: string; contactName: string; initial: PortalAccountUser[]; roles: PortalRole[]; endpoint?: string; selfId?: string;
}) {
  const [users, setUsers] = useState(initial);
  const [n, setN] = useState({ name: '', email: '', roleId: roles[0]?.id ?? 'admin' });
  const [link, setLink] = useState<null | { url: string; name: string }>(null);
  const [editing, setEditing] = useState<null | { id: string; name: string; email: string }>(null);
  const toast = useToast();
  const portalSide = endpoint.startsWith('/api/portal');
  async function invite() {
    try {
      const r = await api<{ users: PortalAccountUser[]; inviteUrl: string }>(endpoint, 'POST', portalSide ? n : { ...n, contactId });
      setUsers(r.users); setLink({ url: r.inviteUrl, name: n.name }); setN({ name: '', email: '', roleId: n.roleId });
    } catch (e) { toast((e as Error).message, 'err'); }
  }
  async function patch(u: PortalAccountUser, body: Record<string, unknown>) {
    try {
      if (!portalSide && body.reset) { const r = await api<{ inviteUrl: string }>(`${endpoint}/${u.id}/invite`, 'POST'); setLink({ url: r.inviteUrl, name: u.name }); setUsers(users.map((x) => (x.id === u.id ? { ...x, invited: true } : x))); return; }
      const r = await api<PortalAccountUser[] | { users: PortalAccountUser[]; inviteUrl?: string }>(`${endpoint}/${u.id}`, 'PATCH', body);
      const list = Array.isArray(r) ? r : r.users;
      setUsers(list);
      if (!Array.isArray(r) && r.inviteUrl) setLink({ url: r.inviteUrl, name: u.name }); else toast('Updated.');
    } catch (e) { toast((e as Error).message, 'err'); }
  }
  const roleOpts = roles.map((r) => [r.id, r.name] as [string, string]);
  return (
    <section className="sheet">
      <h2>People at {contactName}</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th><span className="sr">Actions</span></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><strong>{u.name}</strong>{u.id === selfId && <span className="muted"> (you)</span>}</td><td>{u.email} <button className="linkbtn" onClick={() => setEditing({ id: u.id, name: u.name, email: u.email })} aria-label={`Edit ${u.name}`}>Edit</button></td>
              <td>{u.id === selfId ? roles.find((r) => r.id === u.roleId)?.name : <select aria-label={`Role for ${u.name}`} value={u.roleId} onChange={(e) => patch(u, { roleId: e.target.value })}>{roleOpts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</td>
              <td>{!u.active ? <span className="badge">Inactive</span> : u.invited ? <span className="badge b-amber">Invited</span> : <span className="badge b-green">Active</span>}</td>
              <td>{u.lastLogin ? fmtDateTime(u.lastLogin) : 'Never'}</td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{u.id !== selfId && <>
                <button className="btn" onClick={() => patch(u, { reset: true })}>{u.invited ? 'New invitation link' : 'New password link'}</button>{' '}
                <button className="btn" onClick={() => patch(u, { active: !u.active })}>{u.active ? 'Deactivate' : 'Activate'}</button></>}</td>
            </tr>
          ))}
          {users.length === 0 && <tr><td colSpan={6} className="muted">No users yet. Invite the first one below.</td></tr>}
        </tbody>
      </table></div>
      <h3 className="sub3">Invite someone</h3>
      <div className="grid">
        <TextField id="pu-name" label="Name" value={n.name} onChange={(v) => setN({ ...n, name: v })} />
        <TextField id="pu-email" label="Email" type="email" value={n.email} onChange={(v) => setN({ ...n, email: v })} />
        <SelectField id="pu-role" label="Role" value={n.roleId} options={roleOpts} onChange={(v) => setN({ ...n, roleId: v })} />
      </div>
      <div className="addrow"><button className="btn primary" onClick={invite}>Create invitation</button></div>
      <p className="hint">Invited people set their own password from the link. Deactivating someone signs them out at once.</p>
      {link && <LinkBox url={link.url} name={link.name} onClose={() => setLink(null)} />}
      {editing && (
        <Modal title="Edit person" onClose={() => setEditing(null)}>
          <div className="grid">
            <TextField id="pe-name" label="Name" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
            <TextField id="pe-email" label="Email, used to sign in" type="email" value={editing.email} onChange={(v) => setEditing({ ...editing, email: v })} />
          </div>
          <p className="hint">They keep their password. If you change the email, they sign in with the new one from now on.</p>
          <div className="dlg-actions">
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" onClick={async () => { const u = users.find((x) => x.id === editing.id); if (u) { await patch(u, { name: editing.name, email: editing.email }); } setEditing(null); }}>Save</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

export function RolesPanel({ initial, canEdit }: { initial: PortalRole[]; canEdit: boolean }) {
  const [roles, setRoles] = useState(initial);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<null | { id?: string; name: string; desc: string; perms: Perms }>(null);
  const toast = useToast();
  const cur = roles.find((r) => r.id === sel);
  async function save() {
    if (!draft) return;
    try {
      const body = { name: draft.name, desc: draft.desc, perms: draft.perms };
      setRoles(await api<PortalRole[]>(draft.id ? `/api/b2b/roles/${draft.id}` : '/api/b2b/roles', draft.id ? 'PATCH' : 'POST', body));
      toast('Role saved.'); setDraft(null);
    } catch (e) { toast((e as Error).message, 'err'); }
  }
  async function remove(r: PortalRole) {
    if (!window.confirm(`Delete the role ${r.name}?`)) return;
    try { setRoles(await api<PortalRole[]>(`/api/b2b/roles/${r.id}`, 'DELETE')); setSel(null); toast('Role deleted.'); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  return (
    <div className="tplwrap">
      <section className="sheet">
        <div className="cp" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>Roles</h2>
          {canEdit && <div className="cp-actions"><button className="btn primary" onClick={() => setDraft({ name: 'New role', desc: '', perms: { ...initial.find((r) => r.id === 'viewer')!.perms } })}>New role</button></div>}</div>
        <div className="table-wrap"><table><thead><tr><th>Role</th><th>What it’s for</th></tr></thead><tbody>
          {(['customer', 'supplier'] as const).map((side) => [
            <tr key={side} className="grp"><td colSpan={2}>{side === 'customer' ? 'Customer accounts' : 'Suppliers'}</td></tr>,
            ...roles.filter((r) => r.side === side).map((r) => (
              <tr key={r.id} className={`outrow ${sel === r.id ? 'on' : ''}`} onClick={() => setSel(r.id)}>
                <td><strong>{r.name}</strong> <span className={`badge ${r.builtin ? '' : 'b-accent'}`}>{r.builtin ? 'Built-in' : 'Custom'}</span></td><td>{r.desc}</td>
              </tr>
            )),
          ])}
        </tbody></table></div>
      </section>
      <div>
        {cur ? (
          <section className="sheet">
            <div className="cp" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>{cur.name}</h2>
              {canEdit && <div className="cp-actions">
                {cur.side === 'customer' && <button className="btn" onClick={() => setDraft({ name: `${cur.name} (copy)`, desc: cur.desc, perms: { ...cur.perms } })}>Duplicate</button>}
                {!cur.builtin && <button className="btn" onClick={() => setDraft({ id: cur.id, name: cur.name, desc: cur.desc, perms: { ...cur.perms } })}>Edit</button>}
                {!cur.builtin && <button className="btn ghost" onClick={() => remove(cur)}>Delete</button>}
              </div>}</div>
            <ul className="rnotes">{roleSummary(cur.perms, cur.side).map((x) => <li key={x}>{x}</li>)}</ul>
            {cur.builtin && <p className="hint">{cur.side === 'supplier' ? 'Supplier roles are fixed for now.' : 'Built-in roles can’t be changed. Duplicate one to make your own version.'}</p>}
          </section>
        ) : <p className="hint" style={{ marginTop: 0 }}>Select a role to see what it allows. Custom roles let you mix access, for example a booker who can’t see prices.</p>}
      </div>
      {draft && (
        <Modal title={draft.id ? 'Edit role' : 'New role'} onClose={() => setDraft(null)}>
          <div className="grid">
            <TextField id="r-name" label="Role name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
            <TextField id="r-desc" label="What it’s for" value={draft.desc} onChange={(v) => setDraft({ ...draft, desc: v })} />
            {PERM_DEFS.map(([k, l, opts]) => opts === 'number'
              ? <NumberField key={k} id={`p-${k}`} label={l} step="100" value={draft.perms[k] as number} onChange={(v) => setDraft({ ...draft, perms: { ...draft.perms, [k]: v } })} />
              : <SelectField key={k} id={`p-${k}`} label={l} value={String(draft.perms[k])} options={opts} onChange={(v) => setDraft({ ...draft, perms: { ...draft.perms, [k]: v } as Perms })} />)}
          </div>
          <ul className="rnotes" style={{ marginTop: 12 }}>{roleSummary(draft.perms).map((x) => <li key={x}>{x}</li>)}</ul>
          <div className="dlg-actions"><button className="btn" onClick={() => setDraft(null)}>Cancel</button><button className="btn primary" onClick={save}>Save role</button></div>
        </Modal>
      )}
    </div>
  );
}

export function PortalSettingsForm({ initial, canEdit }: { initial: PortalSettings; canEdit: boolean }) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const toast = useToast();
  const router = useRouter();
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  async function save() {
    try { const r = await api<PortalSettings>('/api/b2b/settings', 'PUT', s); setS(r); setSaved(r); toast('Portal settings saved.'); router.refresh(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  return (
    <section className="sheet">
      <h2>Portal settings</h2>
      <div className="grid">
        <SelectField id="ps-auto" label="Create the booking when a quote is accepted" value={s.autoBook} options={[['yes', 'Yes'], ['no', 'No']]} onChange={(v) => setS({ ...s, autoBook: v as 'yes' | 'no' })} disabled={!canEdit} />
        <SelectField id="ps-up" label="Customers can upload documents" value={s.uploads} options={[['yes', 'Yes'], ['no', 'No']]} onChange={(v) => setS({ ...s, uploads: v as 'yes' | 'no' })} disabled={!canEdit} />
        <NumberField id="ps-days" label="Quotes valid for (days)" value={s.quoteDays} onChange={(v) => setS({ ...s, quoteDays: Math.round(v) })} disabled={!canEdit} />
        <TextField id="ps-resp" label="Reply time you promise" value={s.response} onChange={(v) => setS({ ...s, response: v })} disabled={!canEdit} />
        <TextArea id="ps-wel" label="Welcome message on the portal dashboard" value={s.welcome} onChange={(v) => setS({ ...s, welcome: v })} disabled={!canEdit} />
        <TextArea id="ps-pay" label="Payment instructions shown on open invoices" value={s.payInstructions} onChange={(v) => setS({ ...s, payInstructions: v })} disabled={!canEdit} />
      </div>
      {canEdit && <div className="addrow"><button className="btn primary" onClick={save} disabled={!dirty}>Save</button>{dirty && <button className="btn" onClick={() => setS(saved)}>Discard</button>}</div>}
      <p className="hint">Customers sign in at <b>/portal</b> on this same address, separately from your staff sign-in.</p>
    </section>
  );
}
