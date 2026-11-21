'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import type { EnquirySettings as S } from '@/lib/enquiry';
import { useToast } from './Toast';

export function EnquirySettings({ initial, base }: { initial: S; base: string }) {
  const [s, setS] = useState(initial);
  const [f, setF] = useState({ ...initial, originsText: initial.origins.join('\n') });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const dirty = f.enabled !== s.enabled || f.notify !== s.notify || f.autoReply !== s.autoReply || f.autoReplyText !== s.autoReplyText || f.thankYou !== s.thankYou || f.originsText !== s.origins.join('\n');
  async function save(newKey = false) {
    if (newKey && !window.confirm('Make a new site key? The snippet already on your website stops working until you paste the new one.')) return;
    setBusy(true);
    try {
      const r = await api<S>('/api/enquiry/settings', 'PUT', { enabled: f.enabled, notify: f.notify, autoReply: f.autoReply, autoReplyText: f.autoReplyText, thankYou: f.thankYou, origins: f.originsText.split('\n').map((x) => x.trim()).filter(Boolean), newKey });
      setS(r); setF({ ...r, originsText: r.origins.join('\n') }); toast(newKey ? 'New site key made. Update the snippet on your website.' : 'Website enquiry settings saved.');
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast('Copied.'));
  return (
    <section className="sheet" style={{ marginBottom: 16 }} id="enquiries">
      <div className="cp" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Hosted enquiry form</h2><span className={`badge ${s.enabled ? 'b-green' : ''}`}>{s.enabled ? 'On' : 'Off'}</span></div>
      <p className="hint" style={{ marginTop: 0 }}>The ERP’s own enquiry page, for when you want a form without building one. Enquiries become opportunities in New; spam is filtered without puzzles. Your website’s own forms connect through Enquiry sources above.</p>
      <label className="tgl"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Accept enquiries on the hosted form</label>
      <div className="grid" style={{ marginTop: 10 }}>
        <label className="fld" htmlFor="eq-or"><span>Websites allowed to send (one per line)</span><textarea id="eq-or" rows={3} value={f.originsText} onChange={(e) => setF({ ...f, originsText: e.target.value })} /></label>
        <label className="fld" htmlFor="eq-ty"><span>Thank-you message on the website</span><textarea id="eq-ty" rows={3} value={f.thankYou} onChange={(e) => setF({ ...f, thankYou: e.target.value })} /></label>
      </div>
      <div className="chips" style={{ margin: '10px 0' }}>
        <label className="tgl"><input type="checkbox" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} /> Email the team (Team notifications address in Email sending)</label>
        <label className="tgl"><input type="checkbox" checked={f.autoReply} onChange={(e) => setF({ ...f, autoReply: e.target.checked })} /> Send the visitor an automatic reply</label>
      </div>
      {f.autoReply && <label className="fld wide" htmlFor="eq-ar"><span>Automatic reply text</span><textarea id="eq-ar" rows={3} value={f.autoReplyText} onChange={(e) => setF({ ...f, autoReplyText: e.target.value })} /></label>}
      <div className="addrow"><button className="btn primary" onClick={() => save()} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</button><button className="btn ghost" onClick={() => save(true)} disabled={busy}>New site key</button></div>
      <h3 className="sub3">Hosted form</h3>
      <p className="hint" style={{ marginTop: 0 }}>A ready enquiry page for links from social media, emails or your WhatsApp profile: <a href="/enquire" target="_blank" rel="noopener">{base}/enquire</a> <button className="linkbtn" onClick={() => copy(`${base}/enquire`)}>Copy link</button>
        <br />To show it inside a page: <code className="key">{`<iframe src="${base}/enquire" style="width:100%;height:900px;border:0"></iframe>`}</code> <button className="linkbtn" onClick={() => copy(`<iframe src="${base}/enquire" style="width:100%;height:900px;border:0"></iframe>`)}>Copy</button></p>

    </section>
  );
}
