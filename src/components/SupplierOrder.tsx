'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { DOC_KINDS, fmtDate, fmtDateTime, label, money, todayISO } from '@/lib/constants';
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
        ) : po.status !== 'confirmed' ? <p className="muted" style={{ margin: 0 }}>{po.status === 'cancelled' ? 'No bill is needed for a cancelled order.' : 'Already billed.'}</p>
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
      {po.docs.length > 0 && (
        <section className="sheet" style={{ marginBottom: 16 }}>
          <h2>Files</h2>
          <div className="table-wrap"><table className="lines"><tbody>{po.docs.map((d) => (
            <tr key={d.id}><td>{label(DOC_KINDS, d.kind)}</td><td>{d.name}</td><td className="muted">{d.by}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><a className="btn" href={`/api/portal/files/purchase/${po.id}/${d.id}`} target="_blank" rel="noopener">View</a></td></tr>))}
          </tbody></table></div>
        </section>
      )}
      <Thread messages={po.thread} mine="customer" canWrite={canRespond && po.status !== 'cancelled'} onSend={send} placeholder="Write to our reservations team" />
    </>
  );
}
