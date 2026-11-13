'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { OPEN_REQ, addDays, todayISO } from '@/lib/constants';
import type { Request } from '@/lib/types';
import { RequestSummary, StatusBar, QuoteBox, Thread } from './RequestParts';
import { DocumentsPanel } from './DocumentsPanel';
import { ActivityPanel } from './ActivityPanel';
import { Modal } from './Modal';
import { TextField, TextArea, NumberField } from './Fields';
import { useToast } from './Toast';

export function RequestStaff({ initial, quoteDays }: { initial: Request; quoteDays: number }) {
  const [r, setR] = useState(initial);
  const [tick, setTick] = useState(0);
  const [quote, setQuote] = useState<null | { amount: number; validUntil: string; notes: string }>(null);
  const [decline, setDecline] = useState<null | string>(null);
  const router = useRouter();
  const toast = useToast();
  const open = OPEN_REQ.includes(r.status);
  async function act(body: Record<string, unknown>, msg: string) {
    try { const x = await api<Request>(`/api/b2b/requests/${r.id}/action`, 'POST', body); setR(x); setTick((t) => t + 1); toast(msg); router.refresh(); return x; }
    catch (e) { toast((e as Error).message, 'err'); return null; }
  }
  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href="/b2b">B2B portal</Link><span className="sep">/</span><span>{r.ref}, {r.contactName}</span></div>
        <div className="cp-actions">
          {r.status === 'submitted' && <button className="btn primary" onClick={() => act({ action: 'review' }, 'Review started. The customer sees this in the portal.')}>Start review</button>}
          {open && <button className={`btn ${r.status === 'review' ? 'primary' : ''}`} onClick={() => setQuote({ amount: r.quote?.amount ?? 0, validUntil: r.quote && r.quote.validUntil >= todayISO() ? r.quote.validUntil : addDays(todayISO(), quoteDays), notes: r.quote?.notes ?? '' })}>{r.quote ? 'Change quote' : 'Send quote'}</button>}
          {['review', 'quoted', 'approval', 'accepted'].includes(r.status) && <button className={`btn ${r.status === 'accepted' ? 'primary' : ''}`} onClick={async () => { const x = await act({ action: 'book' }, 'Draft booking created.'); if (x?.bookingId) router.push(`/bookings/${x.bookingId}`); }}>Create booking</button>}
          {open && <button className="btn" onClick={() => setDecline('')}>Decline</button>}
          {r.bookingId && <Link className="btn primary" href={`/bookings/${r.bookingId}`}>Open booking {r.bookingRef}</Link>}
          {r.leadId && <Link className="btn" href={`/crm/${r.leadId}`}>Open opportunity</Link>}
        </div>
        <div className="cp-tools"><StatusBar status={r.status} /></div>
      </div>
      <div className="recpage">
        <div className="recmain">
          <RequestSummary r={r} showAccount />
          <QuoteBox r={r} />
          <Thread messages={r.messages} mine="staff" canWrite={open} placeholder={`Write to ${r.contactName}`} onSend={async (text) => { await act({ action: 'message', text }, 'Message sent.'); }} />
          <DocumentsPanel model="request" id={r.id} docs={r.docs} defaultKind="passport" title="Documents from the customer" emptyText="The customer hasn’t attached anything." onChange={() => setTick((t) => t + 1)} />
        </div>
        <ActivityPanel model="request" id={r.id} refreshKey={tick} />
      </div>
      {quote && (
        <Modal title={`${r.quote ? 'Change the quote' : 'Send a quote'}, ${r.ref}`} onClose={() => setQuote(null)}>
          <div className="grid">
            <NumberField id="q-amt" label="Price for the customer (USD)" step="0.01" value={quote.amount} onChange={(v) => setQuote({ ...quote, amount: v })} />
            <TextField id="q-until" label="Valid until" type="date" min={todayISO()} value={quote.validUntil} onChange={(v) => setQuote({ ...quote, validUntil: v })} />
            <TextArea id="q-notes" label="What’s included" rows={5} value={quote.notes} onChange={(v) => setQuote({ ...quote, notes: v })} />
          </div>
          <p className="hint">The customer sees this in the portal and can accept or decline it. Accepting creates the booking automatically if that’s switched on in the portal settings.</p>
          <div className="dlg-actions"><button className="btn" onClick={() => setQuote(null)}>Cancel</button><button className="btn primary" onClick={async () => { if (await act({ action: 'quote', ...quote }, 'Quote sent to the customer.')) setQuote(null); }}>Send quote</button></div>
        </Modal>
      )}
      {decline !== null && (
        <Modal title={`Decline ${r.ref}`} onClose={() => setDecline(null)}>
          <div className="grid one"><TextArea id="dc-why" label="Reason, shown to the customer" rows={4} value={decline} onChange={setDecline} /></div>
          <div className="dlg-actions"><button className="btn" onClick={() => setDecline(null)}>Cancel</button><button className="btn primary" onClick={async () => { if (await act({ action: 'decline', reason: decline }, 'Request declined.')) setDecline(null); }}>Decline request</button></div>
        </Modal>
      )}
    </>
  );
}
