'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { CONTACT_TYPES, label } from '@/lib/constants';
import type { Contact } from '@/lib/types';
import { Modal } from './Modal';
import { TextField, SelectField } from './Fields';
import { useToast } from './Toast';

/** Type to search existing customers; if nobody matches, create one in a small form without leaving the page. */
export function CustomerPicker({ value, name, onChange, disabled }: { value: string; name: string; onChange: (id: string, name: string, type: string) => void; disabled?: boolean }) {
  const [q, setQ] = useState(name);
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Contact[]>([]);
  const [idx, setIdx] = useState(-1);
  const [creating, setCreating] = useState<null | { name: string; type: string; phone: string; email: string; city: string }>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setQ(name), [name, value]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      api<Contact[]>(`/api/contacts?customers=1&limit=8&q=${encodeURIComponent(q.trim())}`).then(setHits).catch(() => setHits([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  const exact = hits.some((h) => h.name.toLowerCase() === q.trim().toLowerCase());
  const items: (Contact | 'create')[] = [...hits, ...(q.trim() && !exact ? (['create'] as const) : [])];

  function pick(it: Contact | 'create') {
    if (it === 'create') { setCreating({ name: q.trim(), type: 'customer', phone: '', email: '', city: '' }); setOpen(false); return; }
    onChange(it.id, it.name, it.type); setQ(it.name); setOpen(false);
  }
  async function create() {
    if (!creating) return;
    setSaving(true);
    try {
      const c = await api<Contact>('/api/contacts', 'POST', { ...creating, quick: true });
      onChange(c.id, c.name, c.type); setQ(c.name); setCreating(null); toast(`${c.name} created.`);
    } catch (e) { toast((e as Error).message, 'err'); } finally { setSaving(false); }
  }
  if (disabled) return <div className="fld"><span>Customer</span><div className="ro">{name || 'Not set'}</div></div>;
  return (
    <div className="fld">
      <label htmlFor="cb-customer">Customer</label>
      <div className="cb" ref={box} onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) { setOpen(false); setQ(name); } }}>
        <input id="cb-customer" className="cb-input" role="combobox" aria-expanded={open} aria-controls="cbl-customer" aria-autocomplete="list" autoComplete="off"
          aria-activedescendant={idx >= 0 ? `cbo-${idx}` : undefined} placeholder="Type a name to search or create" value={q}
          onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); setIdx(-1); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); if (items.length) setIdx((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length); }
            else if (e.key === 'Enter' && open && items.length) { e.preventDefault(); pick(items[idx >= 0 ? idx : 0]); }
            else if (e.key === 'Escape') { setOpen(false); setQ(name); }
          }} />
        {open && (
          <ul className="cb-list" id="cbl-customer" role="listbox">
            {items.length === 0 && <li className="muted">{q.trim() ? 'No matches' : 'Start typing a name'}</li>}
            {items.map((it, i) => it === 'create'
              ? <li key="create" id={`cbo-${i}`} role="option" aria-selected={i === idx} className={`cb-create ${i === idx ? 'act' : ''}`} onMouseDown={(e) => { e.preventDefault(); pick(it); }}>Create “{q.trim()}”…</li>
              : <li key={it.id} id={`cbo-${i}`} role="option" aria-selected={i === idx} className={i === idx ? 'act' : ''} onMouseDown={(e) => { e.preventDefault(); pick(it); }}>
                  <span>{it.name}</span><span className="muted">{label(CONTACT_TYPES, it.type)}{it.city ? `, ${it.city}` : ''}</span>
                </li>)}
          </ul>
        )}
      </div>
      {creating && (
        <Modal title="New customer" onClose={() => setCreating(null)}>
          <div className="grid">
            <TextField id="nc-name" label="Name" wide value={creating.name} onChange={(v) => setCreating({ ...creating, name: v })} />
            <SelectField id="nc-type" label="Type" value={creating.type} options={CONTACT_TYPES.filter((t) => t[0] !== 'supplier')} onChange={(v) => setCreating({ ...creating, type: v })} />
            <TextField id="nc-phone" label="Phone" type="tel" placeholder="+961" value={creating.phone} onChange={(v) => setCreating({ ...creating, phone: v })} />
            <TextField id="nc-email" label="Email" type="email" value={creating.email} onChange={(v) => setCreating({ ...creating, email: v })} />
            <TextField id="nc-city" label="City" value={creating.city} onChange={(v) => setCreating({ ...creating, city: v })} />
          </div>
          <p className="hint">You can add the rest of the details later in Contacts.</p>
          <div className="dlg-actions">
            <button className="btn" onClick={() => setCreating(null)}>Cancel</button>
            <button className="btn primary" onClick={create} disabled={saving}>{saving ? 'Creating…' : 'Create customer'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
