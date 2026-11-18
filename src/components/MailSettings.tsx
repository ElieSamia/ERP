'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { fmtDateTime } from '@/lib/constants';
import type { MailSettings as MS } from '@/lib/mail';
import { useToast } from './Toast';

type Log = { id: string; at: string; to: string; subject: string; kind: string; status: string; error: string; canResend?: boolean; resent?: boolean }[];
type Draft = Omit<MS, 'hasPassword'> & { password: string };
const pick = (s: MS): Draft => ({ enabled: s.enabled, host: s.host, port: s.port, secure: s.secure, user: s.user, fromName: s.fromName, fromEmail: s.fromEmail, replyTo: s.replyTo, notifyTo: s.notifyTo, appUrl: s.appUrl, password: '' });

export function MailSettings({ initial, log: initialLog, meEmail }: { initial: MS; log: Log; meEmail: string }) {
  const [s, setS] = useState(initial);
  const [f, setF] = useState(pick(initial));
  const [log, setLog] = useState(initialLog);
  const [to, setTo] = useState(meEmail);
  const [busy, setBusy] = useState('');
  const [failedOnly, setFailedOnly] = useState(false);
  const toast = useToast();
  async function load(onlyFailed: boolean) {
    setFailedOnly(onlyFailed);
    const r = await api<{ log: Log }>(`/api/settings/mail${onlyFailed ? '?failed=1' : ''}`).catch(() => null);
    if (r) setLog(r.log);
  }
  async function resend(id: string) {
    setBusy(id);
    try { const r = await api<{ log: Log }>('/api/settings/mail/resend', 'POST', { id, failedOnly }); setLog(r.log); toast('Email resent.'); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(''); }
  }
  const dirty = JSON.stringify(f) !== JSON.stringify(pick(s));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF({ ...f, [k]: v });
  async function save() {
    setBusy('save');
    try { const r = await api<{ settings: MS; log: Log }>('/api/settings/mail', 'PUT', f); setS(r.settings); setF(pick(r.settings)); setLog(r.log); toast('Email settings saved.'); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(''); }
  }
  async function test() {
    if (dirty) return toast('Save the settings first, then send the test.', 'err');
    setBusy('test');
    try { const r = await api<{ log: Log }>('/api/settings/mail/test', 'POST', { to }); setLog(r.log); toast(`Test email sent to ${to}. Check that inbox.`); }
    catch (e) { toast((e as Error).message, 'err'); const r = await api<{ log: Log }>('/api/settings/mail').catch(() => null); if (r) setLog(r.log); }
    finally { setBusy(''); }
  }
  return (
    <section className="sheet" style={{ marginBottom: 16 }} id="email">
      <div className="cp" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Email sending</h2>
        <span className={`badge ${s.enabled && s.hasPassword ? 'b-green' : ''}`}>{s.enabled && s.hasPassword ? 'On' : 'Off'}</span></div>
      <p className="hint" style={{ marginTop: 0 }}>Sends invitations, password links, portal notifications and documents from your own mailbox. For Zoho: server <b>smtppro.zoho.com</b> (or <b>smtppro.zoho.eu</b> if your Zoho account is in Europe), port 465 with SSL, and an <b>application-specific password</b> created in Zoho under Security.</p>
      <div className="grid">
        <label className="fld" htmlFor="m-host"><span>SMTP server</span><input id="m-host" value={f.host} onChange={(e) => set('host', e.target.value)} placeholder="smtppro.zoho.com" /></label>
        <label className="fld" htmlFor="m-port"><span>Port and security</span>
          <select id="m-port" value={`${f.port}-${f.secure ? 'ssl' : 'tls'}`} onChange={(e) => { const [p, sec] = e.target.value.split('-'); setF({ ...f, port: Number(p), secure: sec === 'ssl' }); }}>
            <option value="465-ssl">465, SSL (recommended)</option><option value="587-tls">587, STARTTLS</option>
          </select></label>
        <label className="fld" htmlFor="m-user"><span>Username (the mailbox address)</span><input id="m-user" autoComplete="off" value={f.user} onChange={(e) => set('user', e.target.value)} placeholder="info@thetravelconsult.com" /></label>
        <label className="fld" htmlFor="m-pass"><span>Password {s.hasPassword && <span className="muted">(saved; leave empty to keep it)</span>}</span><input id="m-pass" type="password" autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} placeholder={s.hasPassword ? '••••••••' : 'Application-specific password'} /></label>
        <label className="fld" htmlFor="m-fn"><span>Sender name</span><input id="m-fn" value={f.fromName} onChange={(e) => set('fromName', e.target.value)} placeholder="The Travel Consult" /></label>
        <label className="fld" htmlFor="m-fe"><span>Sending address</span><input id="m-fe" value={f.fromEmail} onChange={(e) => set('fromEmail', e.target.value)} placeholder="info@thetravelconsult.com" /></label>
        <label className="fld" htmlFor="m-rt"><span>Replies go to (optional)</span><input id="m-rt" value={f.replyTo} onChange={(e) => set('replyTo', e.target.value)} placeholder="Same as the sending address" /></label>
        <label className="fld" htmlFor="m-nt"><span>Team notifications go to</span><input id="m-nt" value={f.notifyTo} onChange={(e) => set('notifyTo', e.target.value)} placeholder="reservations@thetravelconsult.com" /></label>
        <label className="fld wide" htmlFor="m-url"><span>ERP address used in email links (optional)</span><input id="m-url" value={f.appUrl} onChange={(e) => set('appUrl', e.target.value)} placeholder="https://erp.thetravelconsult.com" /></label>
      </div>
      <label className="tgl" style={{ marginTop: 10 }}><input type="checkbox" checked={f.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Send emails</label>
      <p className="hint">The password is stored encrypted and is never shown again. Team notifications (new requests, accepted quotes, supplier confirmations and bills, messages) go to the addresses above; separate several with commas. Leave the ERP address empty to use your Vercel address.</p>
      <div className="addrow">
        <button className="btn primary" onClick={save} disabled={!dirty || busy !== ''}>{busy === 'save' ? 'Saving…' : 'Save email settings'}</button>
        <label className="sr" htmlFor="m-to">Send the test to</label>
        <input id="m-to" className="sel" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" />
        <button className="btn" onClick={test} disabled={busy !== '' || !s.enabled}>{busy === 'test' ? 'Sending…' : 'Send a test email'}</button>
      </div>
      <div className="cp" style={{ margin: '16px 0 6px' }}><h3 className="sub3" style={{ margin: 0 }}>Recent emails</h3>
        <div className="chips"><button className={`chip ${!failedOnly ? 'on' : ''}`} onClick={() => load(false)}>All</button><button className={`chip ${failedOnly ? 'on' : ''}`} onClick={() => load(true)}>Failed only</button></div></div>
      {log.length === 0 ? <p className="muted" style={{ margin: 0 }}>{failedOnly ? 'No failed emails.' : 'No emails yet.'}</p> : (
        <div className="table-wrap"><table className="lines">
          <thead><tr><th>When</th><th>To</th><th>Subject</th><th>Result</th></tr></thead>
          <tbody>{log.map((e) => (
            <tr key={e.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.at)}</td><td>{e.to}</td><td>{e.subject}</td>
              <td>{e.status === 'sent' ? <span className="badge b-green">Sent</span> : e.status === 'failed' ? <><span className="badge b-red">Failed</span>{e.resent && <span className="badge b-green" style={{ marginLeft: 4 }}>Resent</span>}<span className="muted" style={{ display: 'block', fontSize: 12.5 }}>{e.error}</span>{e.canResend && <button className="btn" style={{ marginTop: 4 }} onClick={() => resend(e.id)} disabled={busy !== ''}>{busy === e.id ? 'Sending…' : 'Resend'}</button>}</> : <span className="badge" title={e.error}>Not sent</span>}</td></tr>))}
          </tbody></table></div>
      )}
    </section>
  );
}
