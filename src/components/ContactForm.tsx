'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { CONTACT_TYPES } from '@/lib/constants';
import type { Contact } from '@/lib/types';
import { TextField, NumberField, SelectField, TextArea } from './Fields';
import { ActivityPanel } from './ActivityPanel';
import { useToast } from './Toast';

const EMPTY: Omit<Contact, 'id'> = { name: '', type: 'customer', email: '', phone: '', city: '', country: 'Lebanon', creditLimit: 0, marketing: 'yes', portalAccess: 'no', notes: '' };

export function ContactForm({ initial }: { initial?: Contact }) {
  const router = useRouter();
  const toast = useToast();
  const [saved, setSaved] = useState<Omit<Contact, 'id'>>(initial ?? EMPTY);
  const [c, setC] = useState<Omit<Contact, 'id'>>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const dirty = JSON.stringify(c) !== JSON.stringify(saved);
  const set = <K extends keyof typeof c>(k: K, v: (typeof c)[K]) => setC({ ...c, [k]: v });

  async function save() {
    setBusy(true);
    try {
      if (initial) {
        const r = await api<Contact>(`/api/contacts/${initial.id}`, 'PATCH', c);
        setSaved(r); setC(r); setTick((t) => t + 1); toast('Contact saved.'); router.refresh();
      } else {
        const r = await api<Contact>('/api/contacts', 'POST', c);
        toast('Contact created.'); router.push(`/contacts/${r.id}`); router.refresh();
      }
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!initial || !window.confirm(`Delete ${initial.name}? This can’t be undone.`)) return;
    try { await api(`/api/contacts/${initial.id}`, 'DELETE'); toast('Contact deleted.'); router.push('/contacts'); router.refresh(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }

  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href="/contacts">Contacts</Link><span className="sep">/</span><span>{initial ? saved.name : 'New contact'}</span></div>
        <div className="cp-actions">
          {dirty && <span className="dirty">Unsaved changes</span>}
          <button className="btn primary" onClick={save} disabled={busy || (!!initial && !dirty)}>{busy ? 'Saving…' : 'Save'}</button>
          {initial ? (dirty && <button className="btn" onClick={() => setC(saved)}>Discard</button>) : <Link className="btn" href="/contacts">Cancel</Link>}
          {initial && saved.portalAccess === 'yes' && saved.type !== 'supplier' && <Link className="btn" href={`/b2b/accounts/${initial.id}`}>Portal users</Link>}
          {initial && saved.type !== 'supplier' && <a className="btn" href={`/print/statement/${initial.id}`} target="_blank" rel="noopener">Statement</a>}
          {initial && <button className="btn ghost" onClick={remove}>Delete</button>}
        </div>
      </div>
      <div className="recpage">
        <div className="recmain">
          <section className="sheet">
            <div className="grid">
              <TextField id="f-name" label="Name" wide value={c.name} onChange={(v) => set('name', v)} />
              <SelectField id="f-type" label="Type" value={c.type} options={CONTACT_TYPES} onChange={(v) => set('type', v as Contact['type'])} />
              <TextField id="f-email" label="Email" type="email" value={c.email} onChange={(v) => set('email', v)} />
              <TextField id="f-phone" label="Phone" type="tel" value={c.phone} onChange={(v) => set('phone', v)} />
              <TextField id="f-city" label="City" value={c.city} onChange={(v) => set('city', v)} />
              <TextField id="f-country" label="Country" value={c.country} onChange={(v) => set('country', v)} />
              {(c.type === 'agency' || c.type === 'corporate') && <NumberField id="f-credit" label="Credit limit (USD)" step="0.01" value={c.creditLimit} onChange={(v) => set('creditLimit', v)} />}
              {c.type !== 'supplier' && <SelectField id="f-marketing" label="Marketing messages" value={c.marketing} options={[['yes', 'Subscribed'], ['no', 'Unsubscribed']]} onChange={(v) => set('marketing', v as 'yes' | 'no')} />}
              <label className="fld" htmlFor="f-portal"><span>Portal access</span>
                <span className="chk"><input id="f-portal" type="checkbox" checked={c.portalAccess === 'yes'} onChange={(e) => set('portalAccess', e.target.checked ? 'yes' : 'no')} />Can sign in to the portal</span>
              </label>
              <TextArea id="f-notes" label="Notes" value={c.notes} onChange={(v) => set('notes', v)} />
            </div>
          </section>
        </div>
        {initial ? <ActivityPanel model="contact" id={initial.id} refreshKey={tick} /> :
          <aside className="chatter"><h3>Activity</h3><p className="muted" style={{ margin: 0 }}>Nothing is saved until you select Save.</p></aside>}
      </div>
    </>
  );
}
