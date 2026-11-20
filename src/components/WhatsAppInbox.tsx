'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { fmtDateTime } from '@/lib/constants';
import type { WaTemplate } from '@/lib/whatsapp';
import { useToast } from './Toast';

type Conv = { phone: string; contactId: string; name: string; last: string; at: string; direction: string; unread: number };
type Msg = { id: string; direction: string; body: string; at: string; status: string; error: string; by: string; template: string };
const TICK: Record<string, string> = { sent: '✓', delivered: '✓✓', read: '✓✓', failed: '!' };

/** Conversations with customers and suppliers on your WhatsApp business number. Refreshes every 15 seconds. */
export function WhatsAppInbox({ templates, ready }: { templates: WaTemplate[]; ready: boolean }) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [sel, setSel] = useState<string>('');
  const [th, setTh] = useState<{ messages: Msg[]; windowOpenUntil: string } | null>(null);
  const [text, setText] = useState('');
  const [tpl, setTpl] = useState({ key: '', params: [] as string[] });
  const [busy, setBusy] = useState(false);
  const [newTo, setNewTo] = useState('');
  const toast = useToast();
  const loadConvs = useCallback(() => api<Conv[]>('/api/whatsapp/conversations').then(setConvs).catch(() => null), []);
  const loadThread = useCallback((p: string) => api<{ messages: Msg[]; windowOpenUntil: string }>(`/api/whatsapp/conversations/${p}`).then(setTh).catch(() => null), []);
  useEffect(() => { loadConvs(); const t = setInterval(() => { loadConvs(); if (sel) loadThread(sel); }, 15000); return () => clearInterval(t); }, [loadConvs, loadThread, sel]);
  useEffect(() => { if (sel) loadThread(sel); }, [sel, loadThread]);
  const open = th?.windowOpenUntil ? Date.parse(th.windowOpenUntil) > Date.now() : false;
  const t = templates.find((x) => `${x.name}|${x.language}` === tpl.key);
  async function send() {
    if (!sel) return;
    setBusy(true);
    try {
      if (open && text.trim()) await api('/api/whatsapp/send', 'POST', { to: sel, text });
      else if (t) await api('/api/whatsapp/send', 'POST', { to: sel, template: t.name, language: t.language, params: tpl.params });
      else { toast(open ? 'Write a message.' : 'Choose a template.', 'err'); return; }
      setText(''); setTpl({ key: '', params: [] }); await loadThread(sel); await loadConvs();
    } catch (e) { toast((e as Error).message, 'err'); await loadThread(sel); } finally { setBusy(false); }
  }
  const cur = convs.find((c) => c.phone === sel);
  return (
    <div className="wa">
      <aside className="wa-list">
        <div className="addrow" style={{ marginTop: 0 }}>
          <input className="sel" style={{ flex: 1 }} placeholder="New chat: +961…" value={newTo} onChange={(e) => setNewTo(e.target.value)} aria-label="Number for a new conversation" />
          <button className="btn" onClick={() => { const p = newTo.replace(/\D/g, '').replace(/^00/, ''); if (p.length >= 8) { setSel(p); setNewTo(''); } else toast('Enter the number with its country code.', 'err'); }}>Open</button>
        </div>
        {convs.length === 0 ? <p className="muted">No conversations yet. Messages you send and customers’ replies appear here.</p> : convs.map((c) => (
          <button key={c.phone} className={`wa-conv ${sel === c.phone ? 'on' : ''}`} onClick={() => setSel(c.phone)}>
            <b>{c.name || `+${c.phone}`}{c.unread > 0 && <span className="badge b-accent" style={{ marginLeft: 6 }}>{c.unread}</span>}</b>
            <small>{c.direction === 'out' ? 'You: ' : ''}{c.last}</small><small className="muted">{fmtDateTime(c.at)}</small>
          </button>))}
      </aside>
      <section className="wa-thread">
        {!sel ? <p className="muted" style={{ padding: 20 }}>Choose a conversation.</p> : (
          <>
            <div className="wa-head"><b>{cur?.name || `+${sel}`}</b> <span className="muted">+{sel}</span>{cur?.contactId && <Link className="linkbtn" href={`/contacts/${cur.contactId}`}>Open contact</Link>}</div>
            <div className="wa-msgs">{(th?.messages ?? []).map((m) => (
              <div key={m.id} className={`wa-msg ${m.direction === 'in' ? 'in' : 'out'} ${m.status === 'failed' ? 'failed' : ''}`}>
                <p>{m.body}</p>
                <small>{m.template ? `Template ${m.template} · ` : ''}{m.direction === 'out' && m.by ? `${m.by} · ` : ''}{fmtDateTime(m.at)}{m.direction === 'out' && <span className={`tick ${m.status}`} title={m.status}> {TICK[m.status] ?? ''}</span>}</small>
                {m.error && <small className="overdue">Not delivered: {m.error}</small>}
              </div>))}</div>
            {!ready ? <p className="banner">WhatsApp sending isn’t set up. An administrator can connect it under Settings → WhatsApp Business.</p> : open ? (
              <div className="wa-reply">
                <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply" aria-label="Reply" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
                <button className="btn primary" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
                <small className="muted">Free replies allowed until {fmtDateTime(th!.windowOpenUntil)} (24 hours after their last message).</small>
              </div>
            ) : (
              <div className="wa-reply">
                <select value={tpl.key} onChange={(e) => { const x = templates.find((y) => `${y.name}|${y.language}` === e.target.value); setTpl({ key: e.target.value, params: Array(x?.vars ?? 0).fill('') }); }} aria-label="Template">
                  <option value="">Choose a template…</option>{templates.map((x) => <option key={`${x.name}|${x.language}`} value={`${x.name}|${x.language}`}>{x.name} ({x.language})</option>)}</select>
                {t && tpl.params.map((p, i) => <input key={i} className="sel" placeholder={`{{${i + 1}}}`} value={p} onChange={(e) => setTpl({ ...tpl, params: tpl.params.map((q, j) => (j === i ? e.target.value : q)) })} aria-label={`Variable ${i + 1}`} />)}
                <button className="btn primary" onClick={send} disabled={busy || !t}>{busy ? 'Sending…' : 'Send template'}</button>
                <small className="muted">{th?.windowOpenUntil ? 'Their last message was more than 24 hours ago, so' : 'They haven’t written yet, so'} Meta allows only an approved template. Once they reply, you can write freely for 24 hours.{t ? ` Preview: ${t.body}` : ''}</small>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
