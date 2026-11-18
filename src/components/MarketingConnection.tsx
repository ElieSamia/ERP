'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import type { MarketingSettings } from '@/lib/marketing';
import { useToast } from './Toast';

type Draft = Omit<MarketingSettings, 'hasMailchimpKey' | 'hasBrevoKey'> & { mailchimpKey: string; brevoKey: string };
const pick = (s: MarketingSettings): Draft => ({ provider: s.provider, fromName: s.fromName, fromEmail: s.fromEmail, replyTo: s.replyTo, address: s.address, mailchimpList: s.mailchimpList, mailchimpKey: '', brevoKey: '' });

export function MarketingConnection({ initial }: { initial: MarketingSettings }) {
  const [s, setS] = useState(initial);
  const [f, setF] = useState(pick(initial));
  const [lists, setLists] = useState<{ id: string; name: string; members: number }[]>([]);
  const [ok, setOk] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const toast = useToast();
  const dirty = JSON.stringify(f) !== JSON.stringify(pick(s));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF({ ...f, [k]: v });
  async function save() {
    setBusy('save');
    try { const r = await api<MarketingSettings>('/api/marketing/settings', 'PUT', f); setS(r); setF(pick(r)); toast('Marketing connection saved.'); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(''); }
  }
  async function check(which: 'mailchimp' | 'brevo') {
    if (dirty) return toast('Save first, then check the connection.', 'err');
    setBusy(which);
    try {
      const r = await api<{ account: string; lists: { id: string; name: string; members: number }[] }>('/api/marketing/settings/check', 'POST', { which });
      setOk({ ...ok, [which]: r.account }); if (which === 'mailchimp') setLists(r.lists);
      toast(`Connected to ${r.account}.`);
    } catch (e) { setOk({ ...ok, [which]: '' }); toast((e as Error).message, 'err'); } finally { setBusy(''); }
  }
  return (
    <section className="sheet">
      <h2>Connection</h2>
      <p className="hint" style={{ marginTop: 0 }}>Campaigns go out through Mailchimp or Brevo; your Zoho mailbox stays for one-to-one emails. You can add both keys and switch at any time: audiences and campaigns stay in the ERP.</p>
      <div className="grid">
        <label className="fld" htmlFor="mk-p"><span>Send campaigns with</span>
          <select id="mk-p" value={f.provider} onChange={(e) => set('provider', e.target.value as Draft['provider'])}><option value="">Not chosen yet</option><option value="mailchimp">Mailchimp</option><option value="brevo">Brevo</option></select></label>
        <div />
        <label className="fld" htmlFor="mk-mc"><span>Mailchimp API key {s.hasMailchimpKey && <span className="muted">(saved)</span>}</span><input id="mk-mc" type="password" autoComplete="off" value={f.mailchimpKey} placeholder={s.hasMailchimpKey ? '••••••••' : 'Account → Extras → API keys, ends in -us21 or similar'} onChange={(e) => set('mailchimpKey', e.target.value)} /></label>
        <label className="fld" htmlFor="mk-ml"><span>Mailchimp audience</span>
          {lists.length ? <select id="mk-ml" value={f.mailchimpList} onChange={(e) => set('mailchimpList', e.target.value)}><option value="">Choose…</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.members} contacts)</option>)}</select>
            : <input id="mk-ml" value={f.mailchimpList} placeholder="Select Check Mailchimp to choose" onChange={(e) => set('mailchimpList', e.target.value)} />}</label>
        <label className="fld" htmlFor="mk-bv"><span>Brevo API key {s.hasBrevoKey && <span className="muted">(saved)</span>}</span><input id="mk-bv" type="password" autoComplete="off" value={f.brevoKey} placeholder={s.hasBrevoKey ? '••••••••' : 'SMTP & API → API keys, starts with xkeysib-'} onChange={(e) => set('brevoKey', e.target.value)} /></label>
        <div />
        <label className="fld" htmlFor="mk-fn"><span>Sender name</span><input id="mk-fn" value={f.fromName} onChange={(e) => set('fromName', e.target.value)} placeholder="The Travel Consult" /></label>
        <label className="fld" htmlFor="mk-fe"><span>Sender address (verified in Mailchimp or Brevo)</span><input id="mk-fe" value={f.fromEmail} onChange={(e) => set('fromEmail', e.target.value)} placeholder="info@thetravelconsult.com" /></label>
        <label className="fld" htmlFor="mk-rt"><span>Replies go to (optional)</span><input id="mk-rt" value={f.replyTo} onChange={(e) => set('replyTo', e.target.value)} /></label>
        <label className="fld" htmlFor="mk-ad"><span>Postal address shown in every campaign</span><input id="mk-ad" value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="Street, building, Beirut, Lebanon" /></label>
      </div>
      <div className="addrow">
        <button className="btn primary" onClick={save} disabled={busy !== '' || !dirty}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
        <button className="btn" onClick={() => check('mailchimp')} disabled={busy !== '' || !s.hasMailchimpKey}>{busy === 'mailchimp' ? 'Checking…' : 'Check Mailchimp'}</button>
        <button className="btn" onClick={() => check('brevo')} disabled={busy !== '' || !s.hasBrevoKey}>{busy === 'brevo' ? 'Checking…' : 'Check Brevo'}</button>
        {Object.entries(ok).filter(([, v]) => v).map(([k, v]) => <span key={k} className="badge b-green" style={{ alignSelf: 'center' }}>{k === 'mailchimp' ? 'Mailchimp' : 'Brevo'}: {v}</span>)}
      </div>
      <p className="hint">Keys are stored encrypted and never shown again. With Mailchimp, choose the audience the ERP adds your contacts to; it tags each campaign’s recipients there. With Brevo, the ERP keeps its lists in a folder named ERP. In both, verify your sending domain so campaigns don’t land in spam.</p>
    </section>
  );
}
