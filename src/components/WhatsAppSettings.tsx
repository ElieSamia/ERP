'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { fmtDateTime } from '@/lib/constants';
import type { WaEvent, WaSettings } from '@/lib/whatsapp';
import { useToast } from './Toast';

const EVENTS: [WaEvent, string, string][] = [
  ['share', 'Documents you send with Share on WhatsApp', 'Any document'],
  ['booking-confirmed', 'Booking confirmed', 'Booking confirmation, to the customer'],
  ['invoice-posted', 'Invoice posted', 'Invoice, to the customer'],
  ['payment-received', 'Payment received', 'Receipt, to the customer'],
  ['po-sent', 'Purchase order sent', 'Purchase order, to the supplier'],
];
type Draft = Pick<WaSettings, 'enabled' | 'phoneNumberId' | 'wabaId' | 'displayNumber' | 'events'> & { token: string; appSecret: string };
const pick = (s: WaSettings): Draft => ({ enabled: s.enabled, phoneNumberId: s.phoneNumberId, wabaId: s.wabaId, displayNumber: s.displayNumber, events: s.events, token: '', appSecret: '' });

export function WhatsAppSettings({ initial, webhookUrl }: { initial: WaSettings; webhookUrl: string }) {
  const [s, setS] = useState(initial);
  const [f, setF] = useState(pick(initial));
  const [busy, setBusy] = useState('');
  const [test, setTest] = useState({ to: '', template: '' });
  const toast = useToast();
  const dirty = JSON.stringify(f) !== JSON.stringify(pick(s));
  const approved = s.templates.filter((t) => t.status === 'APPROVED');
  const key = (t: { name: string; language: string }) => `${t.name}|${t.language}`;
  async function save() {
    setBusy('save');
    try { const r = await api<WaSettings>('/api/whatsapp/settings', 'PUT', f); setS(r); setF(pick(r)); toast('WhatsApp settings saved.'); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(''); }
  }
  async function sync() {
    if (dirty) return toast('Save first, then sync.', 'err');
    setBusy('sync');
    try { const r = await api<WaSettings>('/api/whatsapp/settings/sync', 'POST'); setS(r); setF(pick(r)); toast(`${r.templates.length} templates found, ${r.templates.filter((t) => t.status === 'APPROVED').length} approved.`); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(''); }
  }
  async function sendTest() {
    const [template, language] = test.template.split('|');
    setBusy('test');
    try { await api('/api/whatsapp/settings/test', 'POST', { to: test.to, template, language }); toast('Sent. Check that phone, and the WhatsApp inbox for delivery.'); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(''); }
  }
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast('Copied.'));
  return (
    <section className="sheet" style={{ marginBottom: 16 }} id="whatsapp">
      <div className="cp" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>WhatsApp Business</h2><span className={`badge ${s.enabled && s.hasToken ? 'b-green' : ''}`}>{s.enabled && s.hasToken ? 'On' : 'Off'}</span></div>
      <p className="hint" style={{ marginTop: 0 }}>Sends from your WhatsApp business number through Meta’s WhatsApp Cloud API. You find these values in Meta’s App Dashboard → WhatsApp → API Setup, and in Business Settings → System users (for a permanent token).</p>
      <div className="grid">
        <label className="fld" htmlFor="wa-pn"><span>Phone number ID</span><input id="wa-pn" value={f.phoneNumberId} onChange={(e) => setF({ ...f, phoneNumberId: e.target.value })} placeholder="1234567890…" /></label>
        <label className="fld" htmlFor="wa-waba"><span>WhatsApp Business account ID</span><input id="wa-waba" value={f.wabaId} onChange={(e) => setF({ ...f, wabaId: e.target.value })} /></label>
        <label className="fld" htmlFor="wa-num"><span>Business number (shown to staff)</span><input id="wa-num" value={f.displayNumber} onChange={(e) => setF({ ...f, displayNumber: e.target.value })} placeholder="+961 …" /></label>
        <label className="fld" htmlFor="wa-tok"><span>Access token {s.hasToken && <span className="muted">(saved)</span>}</span><input id="wa-tok" type="password" autoComplete="off" value={f.token} placeholder={s.hasToken ? '••••••••' : 'Permanent system-user token'} onChange={(e) => setF({ ...f, token: e.target.value })} /></label>
        <label className="fld" htmlFor="wa-sec"><span>App secret {s.hasAppSecret && <span className="muted">(saved)</span>}</span><input id="wa-sec" type="password" autoComplete="off" value={f.appSecret} placeholder={s.hasAppSecret ? '••••••••' : 'App Dashboard → Settings → Basic'} onChange={(e) => setF({ ...f, appSecret: e.target.value })} /></label>
      </div>
      <div className="banner" style={{ display: 'block', margin: '12px 0' }}>
        <b>Webhook</b> (in Meta: WhatsApp → Configuration → Webhook, then subscribe to <i>messages</i>):<br />
        Callback URL <code className="key">{webhookUrl}</code> <button className="linkbtn" onClick={() => copy(webhookUrl)}>Copy</button><br />
        Verify token <code className="key">{s.verifyToken}</code> <button className="linkbtn" onClick={() => copy(s.verifyToken)}>Copy</button>
        <span className="muted" style={{ display: 'block', fontSize: 13, marginTop: 4 }}>Replies and delivery receipts are accepted only when signed with your app secret.</span>
      </div>
      <label className="tgl"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Send WhatsApp messages from the ERP</label>
      <div className="addrow">
        <button className="btn primary" onClick={save} disabled={busy !== '' || !dirty}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
        <button className="btn" onClick={sync} disabled={busy !== '' || !s.hasToken || !s.wabaId}>{busy === 'sync' ? 'Syncing…' : 'Sync templates'}</button>
        {s.templatesAt && <span className="muted" style={{ alignSelf: 'center', fontSize: 13 }}>Last synced {fmtDateTime(s.templatesAt)}</span>}
      </div>
      <h3 className="sub3">Which template for what</h3>
      <p className="hint" style={{ marginTop: 0 }}>Messages you start must use a template Meta approved. Make document templates (category Utility) with the body variables in this order: <b>{'{{1}}'}</b> the customer’s name, <b>{'{{2}}'}</b> the document (for example “Invoice INV/2026/0001”), <b>{'{{3}}'}</b> your company name; and a <b>link button</b> with the URL <code className="key">{webhookUrl.replace('/api/whatsapp/webhook', '/s/')}{'{{1}}'}</code>.</p>
      <div className="table-wrap"><table className="lines">
        <thead><tr><th>Send on WhatsApp</th><th>Event</th><th>Template</th></tr></thead>
        <tbody>{EVENTS.map(([k, l, d]) => (
          <tr key={k}><td>{k === 'share' ? <span className="muted">When you choose</span> : <label className="tgl"><input type="checkbox" checked={f.events[k].on} onChange={(e) => setF({ ...f, events: { ...f.events, [k]: { ...f.events[k], on: e.target.checked } } })} /> Automatically</label>}</td>
            <td><b>{l}</b><span className="muted" style={{ display: 'block', fontSize: 12.5 }}>{d}</span></td>
            <td><select aria-label={`Template for ${l}`} value={f.events[k].template ? `${f.events[k].template}|${f.events[k].language}` : ''} onChange={(e) => { const [template, language] = e.target.value.split('|'); setF({ ...f, events: { ...f.events, [k]: { ...f.events[k], template: template ?? '', language: language ?? '' } } }); }}>
              <option value="">{approved.length ? 'Choose…' : 'Sync templates first'}</option>{approved.map((t) => <option key={key(t)} value={key(t)}>{t.name} ({t.language}){t.urlButton ? ', with link' : ''}</option>)}</select></td></tr>))}
        </tbody></table></div>
      {approved.length > 0 && (
        <div className="addrow">
          <input className="sel" placeholder="Test number, +961…" value={test.to} onChange={(e) => setTest({ ...test, to: e.target.value })} aria-label="Test number" />
          <select value={test.template} onChange={(e) => setTest({ ...test, template: e.target.value })} aria-label="Test template"><option value="">Template…</option>{approved.map((t) => <option key={key(t)} value={key(t)}>{t.name} ({t.language})</option>)}</select>
          <button className="btn" onClick={sendTest} disabled={busy !== '' || !test.to || !test.template || dirty}>{busy === 'test' ? 'Sending…' : 'Send a test'}</button>
        </div>
      )}
      {s.templates.length > 0 && <details style={{ marginTop: 10 }}><summary className="muted">All {s.templates.length} templates</summary>
        <div className="table-wrap"><table className="lines"><thead><tr><th>Template</th><th>Status</th><th>Text</th></tr></thead>
          <tbody>{s.templates.map((t) => <tr key={key(t)}><td><b>{t.name}</b> <span className="muted">{t.language}, {t.category.toLowerCase()}</span></td><td><span className={`badge ${t.status === 'APPROVED' ? 'b-green' : t.status === 'REJECTED' ? 'b-red' : 'b-amber'}`}>{t.status.toLowerCase()}</span></td><td style={{ fontSize: 13 }}>{t.body}</td></tr>)}</tbody></table></div></details>}
    </section>
  );
}
