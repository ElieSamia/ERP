'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DOC_KINDS, OPEN_REQ, SERVICE_TYPES, fmtDateTime, label, money, todayISO, type Perms } from '@/lib/constants';
import type { Request } from '@/lib/types';
import { RequestSummary, StatusBar, QuoteBox, Thread } from './RequestParts';
import { TextField, TextArea, SelectField, NumberField } from './Fields';
import { shrink } from './DocumentsPanel';
import { useToast } from './Toast';

async function call<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { window.location.href = '/portal/login'; throw new Error('Sign in again.'); }
  if (!r.ok) throw new Error((d as { error?: string }).error || 'Something went wrong. Try again.');
  return d as T;
}

const NEXT: Record<string, string> = {
  submitted: 'Our team will review your request, usually {resp}.', review: 'We’re checking availability and prices with our suppliers.',
  quoted: 'Review the quote and accept it to go ahead, or send us a message to change something.', approval: 'Waiting for approval by an approver on your account.',
  accepted: 'We’re booking the services. The booking will appear under Bookings.', booked: 'Your booking is under Bookings. Once we confirm it, you can print the confirmation and vouchers there.',
  declined: 'This request is closed. You can send a new one any time.', cancelled: 'This request is closed. You can send a new one any time.',
};

export function RequestPortal({ initial, perms, response, uploads }: { initial: Request; perms: Perms; response: string; uploads: boolean }) {
  const [r, setR] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('passport');
  const [trav, setTrav] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const router = useRouter();
  const open = OPEN_REQ.includes(r.status);
  const canWrite = perms.requests === 'create';
  async function act(action: string, text = '', msg = 'Done.') {
    try { setR(await call<Request>(`/api/portal/requests/${r.id}/action`, { action, text })); toast(msg); router.refresh(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  async function attach() {
    const f = file.current?.files?.[0];
    if (!f) return toast('Choose a file to attach.', 'err');
    setBusy(true);
    try {
      const fd = new FormData(); const x = await shrink(f);
      fd.append('file', x); fd.append('kind', kind); fd.append('traveller', trav);
      const res = await fetch(`/api/portal/requests/${r.id}/docs`, { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || 'Upload failed.');
      setR({ ...r, docs: d }); if (file.current) file.current.value = ''; toast(`${f.name} attached.`);
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  const q = r.quote;
  const expired = !!q && q.validUntil < todayISO();
  const needsApproval = !!q && perms.approveQuotes !== 'yes' && perms.approvalLimit > 0 && q.amount > perms.approvalLimit;
  const travellers = r.travellers.split('\n').map((x) => x.trim()).filter(Boolean);
  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href="/portal/requests">Requests</Link><span className="sep">/</span><span>{r.ref}</span></div>
        <div className="cp-actions">
          {canWrite && open && <button className="btn" onClick={() => window.confirm('Cancel this request?') && act('cancel', '', 'Request cancelled.')}>Cancel request</button>}
          {r.bookingId && <Link className="btn primary" href={`/portal/bookings/${r.bookingId}`}>Open the booking</Link>}
        </div>
        <div className="cp-tools"><StatusBar status={r.status} /></div>
      </div>
      <div className="recpage">
        <div className="recmain">
          <RequestSummary r={r} />
          <QuoteBox r={r} hidePrice={perms.prices === 'no'}>
            {r.status === 'quoted' && (expired ? <p className="hint">This quote has expired. Send us a message to get an updated price.</p>
              : perms.acceptQuotes === 'yes' ? <>
                <div className="dlg-actions" style={{ justifyContent: 'flex-start' }}>
                  <button className="btn primary" onClick={() => act('accept', '', needsApproval ? 'Sent to an approver on your account.' : 'Quote accepted.')}>{needsApproval ? 'Accept and send for approval' : 'Accept quote'}</button>
                  <button className="btn" onClick={() => act('decline', '', 'Quote declined. Tell us what to change in a message.')}>Decline quote</button>
                </div>
                {needsApproval && <p className="hint">This is above your {money(perms.approvalLimit)} limit, so an approver on your account has to approve it.</p>}
              </> : <p className="hint">A colleague with permission to accept quotes needs to accept it.</p>)}
            {r.status === 'approval' && (perms.approveQuotes === 'yes'
              ? <div className="dlg-actions" style={{ justifyContent: 'flex-start' }}><button className="btn primary" onClick={() => act('approve', '', 'Quote approved.')}>Approve</button><button className="btn" onClick={() => act('reject', '', 'Not approved.')}>Don’t approve</button></div>
              : <p className="hint">Waiting for approval by an approver on your account.</p>)}
          </QuoteBox>
          <Thread messages={r.messages} mine="customer" canWrite={canWrite && open} placeholder="Write to our team" onSend={(t) => act('message', t, 'Message sent.')} />
          {(perms.documents !== 'none' || r.docs.length > 0) && (
            <section className="sheet">
              <h2>Documents</h2>
              {r.docs.length ? <ul className="paylist">{r.docs.map((d) => (
                <li key={d.id}><span>{label(DOC_KINDS, d.kind)}{d.traveller ? `, ${d.traveller}` : ''}: {d.name} <span className="muted">{fmtDateTime(d.at)}</span></span>
                  {perms.documents !== 'none' && <span className="payr">
                    <a className="btn" href={`/api/portal/files/request/${r.id}/${d.id}`} target="_blank" rel="noopener">View</a>{' '}
                    <a className="btn" href={`/api/portal/files/request/${r.id}/${d.id}?download=1`}>Download</a>
                    {canWrite && perms.documents === 'upload' && d.fromPortal && <button className="icon-btn" aria-label={`Remove ${d.name}`} onClick={async () => {
                      if (!window.confirm(`Remove ${d.name}? Our team will see a note that you removed it.`)) return;
                      const res = await fetch(`/api/portal/files/request/${r.id}/${d.id}`, { method: 'DELETE' });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) { toast((data as { error?: string }).error || 'Something went wrong. Try again.', 'err'); return; }
                      setR({ ...r, docs: data as typeof r.docs, messages: [...r.messages, { at: new Date().toISOString(), by: '', side: 'system', text: `File removed: ${d.name}.` }] }); toast('File removed.');
                    }}>×</button>}</span>}</li>))}</ul>
                : <p className="muted" style={{ margin: 0 }}>No documents yet.</p>}
              {canWrite && perms.documents === 'upload' && uploads && open && (
                <div className="addrow">
                  <select aria-label="Document type" value={kind} onChange={(e) => setKind(e.target.value)}>{DOC_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  <select aria-label="Traveller" value={trav} onChange={(e) => setTrav(e.target.value)}><option value="">Whole request</option>{travellers.map((t) => <option key={t}>{t}</option>)}</select>
                  <input ref={file} type="file" aria-label="File" accept="image/jpeg,image/png,image/webp,application/pdf" className="filein" />
                  <button className="btn primary" onClick={attach} disabled={busy}>{busy ? 'Uploading…' : 'Attach'}</button>
                </div>
              )}
            </section>
          )}
        </div>
        <aside className="chatter"><h3>What happens next</h3><p style={{ margin: 0 }}>{(NEXT[r.status] ?? '').replace('{resp}', response)}</p></aside>
      </div>
    </>
  );
}

export function NewRequestForm() {
  const [f, setF] = useState({ type: 'hotel', title: '', destination: '', dateFrom: '', dateTo: '', adults: 2, children: 0, budget: 0, travellers: '', details: '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function submit() {
    setBusy(true);
    try { const r = await call<Request>('/api/portal/requests', f); toast(`Request ${r.ref} sent.`); window.location.href = `/portal/requests/${r.id}`; }
    catch (e) { toast((e as Error).message, 'err'); setBusy(false); }
  }
  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href="/portal/requests">Requests</Link><span className="sep">/</span><span>New request</span></div>
        <div className="cp-actions"><button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Submit request'}</button><Link className="btn" href="/portal/requests">Cancel</Link></div>
      </div>
      <div className="recpage">
        <div className="recmain">
          <section className="sheet"><div className="grid">
            <SelectField id="r-type" label="Service" value={f.type} options={[...SERVICE_TYPES]} onChange={(v) => setF({ ...f, type: v })} />
            <TextField id="r-title" label="What do you need?" value={f.title} placeholder="Hotel in Paris for 2" onChange={(v) => setF({ ...f, title: v })} />
            <TextField id="r-dest" label="Destination" value={f.destination} onChange={(v) => setF({ ...f, destination: v })} />
            <NumberField id="r-budget" label="Budget, optional (USD)" step="0.01" value={f.budget} onChange={(v) => setF({ ...f, budget: v })} />
            <TextField id="r-from" label="From date" type="date" min={todayISO()} value={f.dateFrom} onChange={(v) => setF({ ...f, dateFrom: v, dateTo: f.dateTo && v && f.dateTo < v ? '' : f.dateTo })} />
            <TextField id="r-to" label="To date, empty for one way or a single date" type="date" min={f.dateFrom || todayISO()} value={f.dateTo} onChange={(v) => setF({ ...f, dateTo: v })} />
            <NumberField id="r-ad" label="Adults" value={f.adults} onChange={(v) => setF({ ...f, adults: Math.round(v) })} />
            <NumberField id="r-ch" label="Children" value={f.children} onChange={(v) => setF({ ...f, children: Math.round(v) })} />
            <TextArea id="r-trav" label="Traveller names, one per line, as in passports" value={f.travellers} onChange={(v) => setF({ ...f, travellers: v })} />
            <TextArea id="r-det" label="Details: hotel category, room types, flight times, special requests" rows={5} value={f.details} onChange={(v) => setF({ ...f, details: v })} />
          </div></section>
        </div>
        <aside className="chatter"><h3>How it works</h3><ol className="steps"><li>Send your request with as much detail as you can.</li><li>We check availability and send you a quote here.</li><li>Accept the quote and we book it.</li><li>Your confirmation, vouchers and invoice appear in this portal.</li></ol>
          <p className="hint">After you submit, you can attach passports and other papers on the request.</p></aside>
      </div>
    </>
  );
}
