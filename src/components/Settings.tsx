'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { fmtDateTime } from '@/lib/constants';
import type { Company, StaffUser } from '@/lib/types';
import { TextField, TextArea, SelectField } from './Fields';
import { useToast } from './Toast';

export function CompanyForm({ initial, canEdit }: { initial: Company; canEdit: boolean }) {
  const [c, setC] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const dirty = JSON.stringify(c) !== JSON.stringify(saved);
  const set = (k: keyof Company) => (v: string) => setC({ ...c, [k]: v });
  async function save() {
    setBusy(true);
    try { const r = await api<Company>('/api/settings', 'PUT', c); setC(r); setSaved(r); toast('Company details saved.'); router.refresh(); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  return (
    <section className="sheet" style={{ marginBottom: 16 }}>
      <h2>Company</h2>
      <div className="grid">
        <TextField id="co-name" label="Company name" wide value={c.name} onChange={set('name')} disabled={!canEdit} />
        <TextField id="co-phone" label="Phone" value={c.phone} onChange={set('phone')} disabled={!canEdit} />
        <TextField id="co-email" label="Email" type="email" value={c.email} onChange={set('email')} disabled={!canEdit} />
        <TextArea id="co-address" label="Address" value={c.address} onChange={set('address')} disabled={!canEdit} />
        <TextField id="co-fin" label="Financial number (Ministry of Finance)" value={c.financialNo} onChange={set('financialNo')} disabled={!canEdit} />
        <TextField id="co-vat" label="VAT registration number" value={c.vatNo} onChange={set('vatNo')} disabled={!canEdit} />
        <TextField id="co-cr" label="Commercial register number" value={c.commercialReg} onChange={set('commercialReg')} disabled={!canEdit} />
      </div>
      {canEdit ? (
        <div className="addrow">
          <button className="btn primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</button>
          {dirty && <button className="btn" onClick={() => setC(saved)}>Discard</button>}
        </div>
      ) : <p className="hint">Only administrators can change these details.</p>}
    </section>
  );
}

export function UsersPanel({ initial, meId }: { initial: StaffUser[]; meId: string }) {
  const [users, setUsers] = useState(initial);
  const [n, setN] = useState({ name: '', email: '', role: 'staff', password: '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function add() {
    setBusy(true);
    try { setUsers(await api<StaffUser[]>('/api/users', 'POST', n)); toast(`${n.name} can now sign in.`); setN({ name: '', email: '', role: 'staff', password: '' }); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function patch(id: string, body: Partial<StaffUser>) {
    try { setUsers(await api<StaffUser[]>(`/api/users/${id}`, 'PATCH', body)); toast('User updated.'); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  return (
    <section className="sheet">
      <h2>Staff users</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.name}</strong>{u.id === meId && <span className="muted"> (you)</span>}</td>
                <td>{u.email}</td>
                <td>{u.id === meId ? (u.role === 'admin' ? 'Administrator' : 'Staff') :
                  <select aria-label={`Role for ${u.name}`} value={u.role} onChange={(e) => patch(u.id, { role: e.target.value as StaffUser['role'] })}>
                    <option value="admin">Administrator</option><option value="staff">Staff</option>
                  </select>}</td>
                <td>{u.lastLogin ? fmtDateTime(u.lastLogin) : 'Never'}</td>
                <td>{u.active ? <span className="badge b-green">Active</span> : <span className="badge">Inactive</span>}</td>
                <td style={{ textAlign: 'right' }}>{u.id !== meId && <button className="btn" onClick={() => patch(u.id, { active: !u.active })}>{u.active ? 'Deactivate' : 'Activate'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="sub3">Add a staff user</h3>
      <div className="grid">
        <TextField id="nu-name" label="Name" value={n.name} onChange={(v) => setN({ ...n, name: v })} />
        <TextField id="nu-email" label="Email" type="email" value={n.email} onChange={(v) => setN({ ...n, email: v })} />
        <SelectField id="nu-role" label="Role" value={n.role} options={[['staff', 'Staff'], ['admin', 'Administrator']]} onChange={(v) => setN({ ...n, role: v })} />
        <TextField id="nu-pass" label="Temporary password, at least 10 characters" type="password" value={n.password} onChange={(v) => setN({ ...n, password: v })} />
      </div>
      <div className="addrow"><button className="btn primary" onClick={add} disabled={busy}>{busy ? 'Adding…' : 'Add user'}</button></div>
      <p className="hint">Share the temporary password privately. Changing passwords from the app comes in a later phase.</p>
    </section>
  );
}
