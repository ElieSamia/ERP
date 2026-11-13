'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import type { DocKind } from '@/lib/constants';
import { Modal } from './Modal';

export function PrintButton() {
  return <button className="btn primary" onClick={() => window.print()}>Print or save as PDF</button>;
}

type ShareTarget = { kind: DocKind; id: string; pid?: string; prices?: boolean };
type Created = { url: string; token: string; until: string; title: string; number: string; company: string; party: { name: string; email: string; phone: string } };

const TEMPLATES: Record<DocKind, { subject: string; body: string }> = {
  confirm: { subject: 'Your booking confirmation {number}', body: 'Dear {name},\n\nYour booking confirmation {number} is ready:\n{link}\n\nPlease check the names and dates against the passports and let us know if anything needs changing.\n\nKind regards,\n{company}' },
  vouchers: { subject: 'Hotel vouchers for booking {number}', body: 'Dear {name},\n\nYour hotel vouchers for booking {number} are ready:\n{link}\n\nPlease show them at check-in.\n\nHave a great trip,\n{company}' },
  invoice: { subject: 'Invoice {number} from {company}', body: 'Dear {name},\n\nPlease find your invoice {number} here:\n{link}\n\nKind regards,\n{company}' },
  receipt: { subject: 'Payment receipt {number}', body: 'Dear {name},\n\nThank you for your payment. Your receipt {number} is here:\n{link}\n\nKind regards,\n{company}' },
  po: { subject: 'Purchase order {number} from {company}', body: 'Hello,\n\nPlease find our purchase order {number} here:\n{link}\n\nKindly confirm availability.\n\nRegards,\n{company}' },
  statement: { subject: 'Statement of account from {company}', body: 'Dear {name},\n\nYour statement of account is here:\n{link}\n\nKind regards,\n{company}' },
  supstatement: { subject: 'Statement from {company}', body: 'Hello,\n\nHere is your statement with us, showing your bills, our payments and what is still owed:\n{link}\n\nRegards,\n{company}' },
  voucher: { subject: 'Payment {number} from {company}', body: 'Hello,\n\nPlease find the payment voucher {number} here:\n{link}\n\nRegards,\n{company}' },
};
const fill = (s: string, m: Record<string, string>) => s.replace(/\{(\w+)\}/g, (x, k) => m[k] ?? x);
const waNumber = (p: string) => p.replace(/[^\d]/g, '').replace(/^00/, '');

function ShareDialog({ target, channel, onClose }: { target: ShareTarget; channel: 'email' | 'whatsapp'; onClose: () => void }) {
  const [c, setC] = useState<Created | null>(null);
  const [err, setErr] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState(false);
  const asked = useRef(false);
  useEffect(() => {
    // One link per dialog. The ref stops React's development double-run from creating two.
    if (asked.current) return;
    asked.current = true;
    api<Created>('/api/share', 'POST', target).then((r) => {
      const t = TEMPLATES[target.kind];
      const m = { name: r.party.name.split(' ')[0] || r.party.name, number: r.number, company: r.company, link: r.url };
      setC(r); setTo(channel === 'email' ? r.party.email : r.party.phone);
      setSubject(fill(t.subject, m)); setBody(`${fill(t.body, m)}\n\nThe link works until ${r.until}.`);
    }).catch((e) => setErr((e as Error).message));
  }, [target, channel]);
  const log = (ch: 'email' | 'whatsapp' | 'copy') => c && api(`/api/share/${c.token}`, 'PATCH', { channel: ch, to }).catch(() => null);
  function open() {
    if (!c) return;
    if (channel === 'email') window.location.href = `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    else window.open(`https://wa.me/${waNumber(to)}?text=${encodeURIComponent(body)}`, '_blank', 'noopener');
    log(channel);
  }
  async function copy() {
    if (!c) return;
    await navigator.clipboard.writeText(c.url).catch(() => null);
    setCopied(true); log('copy');
  }
  async function cancelLink() {
    if (!c || !window.confirm('Cancel this link? Anyone who has it won’t be able to open the document.')) return;
    await api(`/api/share/${c.token}`, 'DELETE').catch(() => null);
    onClose();
  }
  return (
    <Modal title={channel === 'email' ? 'Share by email' : 'Share on WhatsApp'} onClose={onClose}>
      {err ? <p className="form-error">{err}</p> : !c ? <p className="muted">Creating a secure link…</p> : (
        <>
          <div className="grid one">
            {channel === 'email' ? (
              <>
                <label className="fld" htmlFor="sh-to"><span>To, {c.party.name || 'recipient'}</span><input id="sh-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Email address" /></label>
                <label className="fld" htmlFor="sh-sub"><span>Subject</span><input id="sh-sub" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
              </>
            ) : (
              <label className="fld" htmlFor="sh-to"><span>WhatsApp number, with country code</span><input id="sh-to" type="tel" value={to} onChange={(e) => setTo(e.target.value)} placeholder="+961 …" /></label>
            )}
            <label className="fld" htmlFor="sh-body"><span>Message</span><textarea id="sh-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} /></label>
            <div className="fld"><span>Link</span><div className="mk"><input readOnly value={c.url} aria-label="Share link" onFocus={(e) => e.target.select()} /><button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button></div></div>
          </div>
          <p className="hint">
            {channel === 'email' ? 'Opens your email app with the message ready, so you can check it and send it from your own address.' : 'Opens WhatsApp with the message ready, on this computer or your phone. Leave the number empty to choose the chat yourself.'}
            {' '}The link shows only this document and stops working on {c.until}.
          </p>
          <div className="dlg-actions">
            <button className="btn ghost" onClick={cancelLink}>Cancel link</button>
            <button className="btn" onClick={onClose}>Close</button>
            <button className="btn primary" onClick={open}>{channel === 'email' ? 'Open in email app' : 'Open WhatsApp'}</button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function PrintBar({ back, backLabel = 'Back to the booking', toggle, share }: { back: string; backLabel?: string; toggle?: { href: string; label: string }; share?: ShareTarget }) {
  const [channel, setChannel] = useState<null | 'email' | 'whatsapp'>(null);
  return (
    <>
      <div className="doc-toolbar noprint">
        <PrintButton />
        {share && <button className="btn" onClick={() => setChannel('email')}>Share by email</button>}
        {share && <button className="btn" onClick={() => setChannel('whatsapp')}>Share on WhatsApp</button>}
        {toggle && <Link className="btn" href={toggle.href}>{toggle.label}</Link>}
        <Link className="btn" href={back}>{backLabel}</Link>
        <span className="muted">To get a PDF, choose Save as PDF in the print dialog.</span>
      </div>
      {share && channel && <ShareDialog key={channel} target={share} channel={channel} onClose={() => setChannel(null)} />}
    </>
  );
}
