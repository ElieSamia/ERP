'use client';
import { useState } from 'react';
import { REQ_STATES, SERVICE_TYPES, fmtDate, fmtDateTime, fmtRange, label, money } from '@/lib/constants';
import type { Request } from '@/lib/types';

/** The facts of a request, shared by the staff and portal views. */
export function RequestSummary({ r, showAccount }: { r: Request; showAccount?: boolean }) {
  const rows: [string, string][] = [
    ...(showAccount ? [['Account', r.contactName ?? ''] as [string, string]] : []),
    ['Service', label(SERVICE_TYPES, r.type)], ['Destination', r.destination || 'Not set'], ['Dates', fmtRange(r.dateFrom, r.dateTo) || 'Flexible'],
    ['Travellers', `${r.adults} adult${r.adults === 1 ? '' : 's'}${r.children ? `, ${r.children} child${r.children === 1 ? '' : 'ren'}` : ''}`],
    ['Budget', r.budget ? money(r.budget) : 'Not given'], ['Requested by', `${r.createdBy}, ${fmtDate(r.createdAt.slice(0, 10))}`],
  ];
  return (
    <section className="sheet">
      <h2>{r.title}</h2>
      <dl className="facts">{rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {r.travellers && <><h3 className="sub3">Traveller names</h3><p className="pre" style={{ margin: 0 }}>{r.travellers}</p></>}
      {r.details && <><h3 className="sub3">Details</h3><p className="pre" style={{ margin: 0 }}>{r.details}</p></>}
    </section>
  );
}

export function StatusBar({ status }: { status: string }) {
  const closed = status === 'declined' || status === 'cancelled';
  return (
    <ol className="statusbar" aria-label="Status">
      {REQ_STATES.filter(([k]) => !['declined', 'cancelled', 'approval'].includes(k) || k === status).map(([k, l]) => (
        <li key={k} className={`${k === status ? 'on' : ''} ${closed && k === status ? 'cancel' : ''}`} aria-current={k === status ? 'step' : undefined}>{l}</li>
      ))}
    </ol>
  );
}

export function QuoteBox({ r, hidePrice, children }: { r: Request; hidePrice?: boolean; children?: React.ReactNode }) {
  if (!r.quote) return null;
  const expired = r.status === 'quoted' && r.quote.validUntil < new Date().toISOString().slice(0, 10);
  return (
    <section className="sheet quote">
      <h2>Quote</h2>
      <div className="qrow">
        <div><span className="lbl3">Price for this request</span><b className="qamt">{hidePrice ? 'Hidden for your role' : money(r.quote.amount)}</b></div>
        <div><span className="lbl3">Valid until</span><b>{fmtDate(r.quote.validUntil)}</b> {expired && <span className="badge b-red">Expired</span>}</div>
      </div>
      {r.quote.notes && <p className="pre" style={{ margin: '10px 0 0' }}>{r.quote.notes}</p>}
      {children}
    </section>
  );
}

/** The conversation between the customer and your team. "mine" is the side the viewer is on. */
export function Thread({ messages, mine, canWrite, onSend, placeholder }: { messages: Request['messages']; mine: 'customer' | 'staff'; canWrite: boolean; onSend: (t: string) => Promise<void>; placeholder: string }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try { await onSend(text); setText(''); } finally { setBusy(false); }
  }
  return (
    <section className="sheet">
      <h2>Messages</h2>
      {messages.length ? (
        <ol className="thread">
          {messages.map((m, i) => m.side === 'system'
            ? <li key={i} className="msg sys"><p>{m.text} <time>{fmtDateTime(m.at)}</time></p></li>
            : <li key={i} className={`msg ${m.side === mine ? 'mine' : ''}`}><div className="who">{m.by}<time>{fmtDateTime(m.at)}</time></div><p className="pre">{m.text}</p></li>)}
        </ol>
      ) : <p className="muted" style={{ margin: '0 0 10px' }}>No messages yet.</p>}
      {canWrite && (
        <div className="note">
          <label className="sr" htmlFor="rq-msg">Message</label>
          <textarea id="rq-msg" rows={2} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn primary" onClick={send} disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send message'}</button>
        </div>
      )}
    </section>
  );
}
