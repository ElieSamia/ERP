'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { DOC_KINDS, SUPPLIER_DOC_KINDS, fmtDate, fmtDateTime, label, money, todayISO } from '@/lib/constants';
import type { BookingDoc, Purchase } from '@/lib/types';
import { Thread } from './RequestParts';
import { shrink } from './DocumentsPanel';
import { useToast } from './Toast';

type Po = Pick<Purchase, 'id' | 'ref' | 'status' | 'supplierAck' | 'thread' | 'supplierBill'> & { docs: BookingDoc[]; total: number };

/** What a supplier can do on one order: confirm it, write to us, and upload their bill. */
export function SupplierOrder({ initial, canRespond, canBill }: { initial: Po; canRespond: boolean; canBill: boolean }) {
  const [po, setPo] = useState(initial);
  const [ref, setRef] = useState('');
  const [bill, setBill] = useState({ billRef: '', billDate: todayISO(), amount: String(initial.total) });
  const [file, setFile] = useState<File | null>(null);
  const kinds = SUPPLIER_DOC_KINDS.filter((k) => (canRespond ? true : canBill && k === 'bill'));
  const [doc, setDoc] = useState<{ kind: string; file: File | null }>({ kind: kinds[0] ?? 'bill', file: null });
  const [docKey, setDocKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const done = (r: Purchase, total = po.total) => { setPo({ ...r, docs: r.docs.filter((d) => d.shared !== 'no'), total }); router.refresh(); };

  async function ack() {
    setBusy(true);
    try { done(await api<Purchase>(`/api/portal/orders/${po.id}/action`, 'POST', { action: 'ack', ref })); toast('Order confirmed. Thank you.'); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function send(text: string) {
    try { done(await api<Purchase>(`/api/portal/orders/${po.id}/action`, 'POST', { action: 'message', text })); }
    catch (e) { toast((e as Error).message, 'err'); throw e; }
  }
  async function upload() {
    if (!file) return toast('Choose the bill file, a PDF or a photo.', 'err');
    setBusy(true);
    try {
      const f = await shrink(file);
      if (f.size > 4 * 1024 * 1024) throw new Error('That file is over 4 MB. Attach a smaller file.');
      const fd = new FormData();
      fd.append('file', f); fd.append('billRef', bill.billRef); fd.append('billDate', bill.billDate); fd.append('amount', bill.amount);
      const res = await fetch(`/api/portal/orders/${po.id}/bill`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Something went wrong. Try again.');
      done(data as Purchase); setFile(null); toast('Bill uploaded. Our accounts team will record it.');
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }

  async function sendFile() {
    if (!doc.file) return toast('Choose a file to upload.', 'err');
    setBusy(true);
    try {
      const f = await shrink(doc.file);
      if (f.size > 4 * 1024 * 1024) throw new Error('That file is over 4 MB. Attach a smaller file.');
      const fd = new FormData();
      fd.append('file', f); fd.append('kind', doc.kind);
      const res = await fetch(`/api/portal/orders/${po.id}/docs`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Something went wrong. Try again.');
      done(data as Purchase); setDoc({ ...doc, file: null }); setDocKey((k) => k + 1); toast(`${f.name} uploaded.`);
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }

  async function removeFile(d: BookingDoc) {
    if (!window.confirm(`Remove ${d.name}? Our team will see a note that you removed it.`)) return;
    try {
      const res = await fetch(`/api/portal/files/purchase/${po.id}/${d.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Something went wrong. Try again.');
      setPo({ ...po, docs: (data as BookingDoc[]).filter((x) => x.shared !== 'no'), thread: [...po.thread, { at: new Date().toISOString(), by: '', side: 'system', text: `${label(DOC_KINDS, d.kind)} removed: ${d.name}.` }] });
      router.refresh(); toast('File removed.');
    } catch (e) { toast((e as Error).message, 'err'); }
  }

  const open = po.status === 'confirmed';
  return (
    <>
      <section className="sheet" style={{ marginBottom: 16 }}>
        <h2>Your confirmation</h2>
        {po.supplierAck ? (
          <p style={{ margin: 0 }}><span className="badge b-green">Confirmed</span> by {po.supplierAck.by} on {fmtDateTime(po.supplierAck.at)}{po.supplierAck.ref && <>, your reference <b>{po.supplierAck.ref}</b></>}.</p>
        ) : po.status === 'cancelled' ? <p className="muted" style={{ margin: 0 }}>This order was cancelled.</p>
          : canRespond ? (
            <div className="addrow" style={{ marginTop: 0 }}>
              <label className="sr" htmlFor="ack-ref">Your reference</label>
              <input id="ack-ref" className="sel" placeholder="Your booking reference (optional)" value={ref} onChange={(e) => setRef(e.target.value)} />
              <button className="btn primary" onClick={ack} disabled={busy}>Confirm this order</button>
            </div>
          ) : <p className="muted" style={{ margin: 0 }}>Not confirmed yet.</p>}
        {!po.supplierAck && open && canRespond && <p className="hint">If you can’t provide the services as ordered, don’t confirm. Send us a message below instead.</p>}
      </section>
      <section className="sheet" style={{ marginBottom: 16 }}>
        <h2>Your bill</h2>
        {po.supplierBill ? (
          <p style={{ margin: 0 }}>Bill <b>{po.supplierBill.ref}</b> of {fmtDate(po.supplierBill.date)} for <b>{money(po.supplierBill.amount)}</b>, uploaded {fmtDateTime(po.supplierBill.at)}.{' '}
            {po.status === 'confirmed' ? <span className="badge b-amber">Waiting for us to record it</span> : <span className="badge b-green">Recorded</span>}</p>
        ) : po.status !== 'confirmed' ? <p className="muted" style={{ margin: 0 }}>{po.status === 'cancelled' ? 'No bill is needed for a cancelled order.' : 'We have recorded the bill for this order.'}{po.status !== 'cancelled' && kinds.includes('bill') ? ' To send us the bill file, upload it under Files below as a supplier bill.' : ''}</p>
          : canBill ? (
            <>
              <div className="grid">
                <label className="fld" htmlFor="b-ref"><span>Bill or invoice number</span><input id="b-ref" value={bill.billRef} onChange={(e) => setBill({ ...bill, billRef: e.target.value })} /></label>
                <label className="fld" htmlFor="b-date"><span>Bill date</span><input id="b-date" type="date" value={bill.billDate} onChange={(e) => setBill({ ...bill, billDate: e.target.value })} /></label>
                <label className="fld" htmlFor="b-amt"><span>Bill total (USD)</span><input id="b-amt" type="number" min={0} step="0.01" value={bill.amount} onChange={(e) => setBill({ ...bill, amount: e.target.value })} /></label>
                <label className="fld" htmlFor="b-file"><span>File, PDF or photo up to 4 MB</span><input id="b-file" type="file" className="filein" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
              </div>
              <div className="addrow"><button className="btn primary" onClick={upload} disabled={busy}>{busy ? 'Uploading…' : 'Upload bill'}</button></div>
              <p className="hint">The order total is {money(po.total)}. If your bill differs, send us a message explaining why.</p>
            </>
          ) : <p className="muted" style={{ margin: 0 }}>No bill uploaded yet.</p>}
      </section>
      {(po.docs.length > 0 || (po.status !== 'cancelled' && kinds.length > 0)) && (
        <section className="sheet" style={{ marginBottom: 16 }}>
          <h2>Files</h2>
          {po.docs.length > 0 ? (
            <div className="table-wrap"><table className="lines">
              <thead><tr><th>Type</th><th>File</th><th>Added</th><th><span className="sr">View</span></th></tr></thead>
              <tbody>{po.docs.map((d) => (
                <tr key={d.id}><td>{label(DOC_KINDS, d.kind)}</td><td>{d.name}</td><td className="muted">{fmtDateTime(d.at)}<span style={{ display: 'block', fontSize: 12.5 }}>{d.by}</span></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <a className="btn" href={`/api/portal/files/purchase/${po.id}/${d.id}`} target="_blank" rel="noopener">View</a>{' '}
                    <a className="btn" href={`/api/portal/files/purchase/${po.id}/${d.id}?download=1`}>Download</a>
                    {d.fromPortal && kinds.length > 0 && (canRespond || d.kind === 'bill') && <button className="icon-btn" onClick={() => removeFile(d)} aria-label={`Remove ${d.name}`}>×</button>}
                  </td></tr>))}
              </tbody></table></div>
          ) : <p className="muted" style={{ margin: 0 }}>No files yet.</p>}
          {po.status !== 'cancelled' && kinds.length > 0 && (
            <>
              <div className="addrow">
                <label className="sr" htmlFor="sd-kind">Type of file</label>
                <select id="sd-kind" value={doc.kind} onChange={(e) => setDoc({ ...doc, kind: e.target.value })}>{kinds.map((k) => <option key={k} value={k}>{label(DOC_KINDS, k)}</option>)}</select>
                <label className="sr" htmlFor="sd-file">File</label>
                <input key={docKey} id="sd-file" type="file" className="filein" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" onChange={(e) => setDoc({ ...doc, file: e.target.files?.[0] ?? null })} />
                <button className="btn primary" onClick={sendFile} disabled={busy}>{busy ? 'Uploading…' : 'Upload a file'}</button>
              </div>
              <p className="hint">Confirmations, vouchers, ticket copies or the bill file, as a PDF or image up to 4 MB. Our team sees it straight away. You can remove files you sent with ×; our team sees a note of every removal.</p>
            </>
          )}
        </section>
      )}
      <Thread messages={po.thread} mine="customer" canWrite={canRespond && po.status !== 'cancelled'} onSend={send} placeholder="Write to our reservations team" />
    </>
  );
}
