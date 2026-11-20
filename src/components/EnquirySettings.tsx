'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import type { EnquirySettings as S } from '@/lib/enquiry';
import { useToast } from './Toast';

/** The HTML to paste into WordPress (a Custom HTML block): a styled form that sends straight to the ERP. */
function snippet(base: string, key: string) {
  return `<!-- The Travel Consult ERP: enquiry form. Paste into a WordPress "Custom HTML" block. -->
<form class="ttc-enq" novalidate>
  <div class="ttc-g">
    <label>Your name<input name="name" required autocomplete="name"></label>
    <label>Email<input name="email" type="email" autocomplete="email"></label>
    <label>Phone or WhatsApp<input name="phone" type="tel" placeholder="+961 …"></label>
    <label>I'm looking for<select name="type"><option value="package">Holiday package</option><option value="flight">Flights</option><option value="hotel">Hotel</option><option value="visa">Visa</option><option value="insurance">Travel insurance</option><option value="transfer">Transfers</option><option value="other">Something else</option></select></label>
    <label>Destination<input name="destination"></label>
    <label>From<input name="from" type="date"></label>
    <label>To<input name="to" type="date"></label>
    <label>Adults<input name="adults" type="number" min="1" value="2"></label>
    <label>Children<input name="children" type="number" min="0" value="0"></label>
    <label>Budget (USD)<input name="budget" type="number" min="0"></label>
    <label class="ttc-w">Message<textarea name="message" rows="4"></textarea></label>
  </div>
  <label class="ttc-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
  <label class="ttc-c"><input type="checkbox" name="marketing"> Send me travel offers by email</label>
  <p class="ttc-msg" role="status"></p>
  <button type="submit">Send my request</button>
</form>
<style>
.ttc-enq{max-width:760px;font:inherit}.ttc-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.ttc-enq label{display:flex;flex-direction:column;gap:4px;font-size:14px}.ttc-w{grid-column:1/-1}
.ttc-enq input,.ttc-enq select,.ttc-enq textarea{padding:9px 10px;border:1px solid #cfd8d6;border-radius:8px;font:inherit}
.ttc-hp{position:absolute;left:-9999px}.ttc-c{flex-direction:row!important;align-items:center;margin:12px 0}
.ttc-enq button{background:#0E6B6B;color:#fff;border:0;border-radius:8px;padding:11px 20px;font-weight:600;cursor:pointer}
.ttc-msg{min-height:1em;margin:8px 0}.ttc-msg.err{color:#A63434}.ttc-msg.ok{color:#0E6B6B;font-weight:600}
</style>
<script>
(function(){var f=document.currentScript.previousElementSibling.previousElementSibling,t=Date.now();
f.addEventListener('submit',function(e){e.preventDefault();var m=f.querySelector('.ttc-msg'),b=f.querySelector('button');
var d={};new FormData(f).forEach(function(v,k){d[k]=v});d.key='${key}';d.started=t;d.marketing=!!d.marketing;d.page=location.href;
var u=new URLSearchParams(location.search);d.utm=['utm_source','utm_medium','utm_campaign'].map(function(k){return u.get(k)}).filter(Boolean).join(' / ');
b.disabled=true;m.className='ttc-msg';m.textContent='Sending…';
fetch('${base}/api/public/enquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)})
.then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Something went wrong.');return j})})
.then(function(j){f.querySelector('.ttc-g').style.display='none';f.querySelector('.ttc-c').style.display='none';b.style.display='none';m.className='ttc-msg ok';m.textContent=j.message})
.catch(function(x){b.disabled=false;m.className='ttc-msg err';m.textContent=x.message})});})();
</script>`;
}

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
  const code = snippet(base, s.siteKey);
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast('Copied.'));
  return (
    <section className="sheet" style={{ marginBottom: 16 }} id="enquiries">
      <div className="cp" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Website enquiries</h2><span className={`badge ${s.enabled ? 'b-green' : ''}`}>{s.enabled ? 'On' : 'Off'}</span></div>
      <p className="hint" style={{ marginTop: 0 }}>Enquiries from your website become CRM opportunities in New, linked to the contact with the same email or phone (or a new contact). Spam is filtered without puzzles.</p>
      <label className="tgl"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Accept enquiries</label>
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
      <h3 className="sub3">Add the form to your website</h3>
      <p className="hint" style={{ marginTop: 0 }}><b>WordPress:</b> edit the page, add a <b>Custom HTML</b> block, paste this, and publish. It takes your theme’s font and sends straight to the ERP.</p>
      <textarea className="code" readOnly rows={8} value={code} aria-label="Enquiry form code" onFocus={(e) => e.target.select()} />
      <div className="addrow"><button className="btn" onClick={() => copy(code)}>Copy the form code</button></div>
      <p className="hint"><b>Or use the hosted form</b>, for a link from social media, emails or your WhatsApp profile: <a href="/enquire" target="_blank" rel="noopener">{base}/enquire</a> <button className="linkbtn" onClick={() => copy(`${base}/enquire`)}>Copy link</button>
        <br />To show it inside a page: <code className="key">{`<iframe src="${base}/enquire" style="width:100%;height:900px;border:0"></iframe>`}</code> <button className="linkbtn" onClick={() => copy(`<iframe src="${base}/enquire" style="width:100%;height:900px;border:0"></iframe>`)}>Copy</button></p>
      <p className="hint">A form plugin (Contact Form 7, WPForms, Elementor) can also send here with a webhook: POST to <code className="key">{base}/api/public/enquiry</code> with the fields name, email, phone, type, destination, from, to, adults, children, budget, message and key <code className="key">{s.siteKey}</code>.</p>
    </section>
  );
}
