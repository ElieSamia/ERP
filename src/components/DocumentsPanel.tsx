'use client';
import { useRef, useState } from 'react';
import { DOC_KINDS, fmtDateTime, label } from '@/lib/constants';
import type { BookingDoc } from '@/lib/types';
import { useToast } from './Toast';

const MAX = 4 * 1024 * 1024;
const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Phone photos are often 3 to 5 MB. Shrinking them keeps documents readable at a fraction of the storage. */
export async function shrink(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 400 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.(png|webp|jpeg)$/i, '') + (/\.jpe?g$/i.test(file.name) ? '' : '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** Uploads one file to a booking, purchase order or expense and returns the updated file list. */
export async function uploadDoc(model: string, id: string, f: File, kind: string, traveller = ''): Promise<BookingDoc[]> {
  const file = await shrink(f);
  if (file.size > MAX) throw new Error('That file is over 4 MB, even after shrinking. Attach a smaller file.');
  const fd = new FormData();
  fd.append('file', file); fd.append('kind', kind); fd.append('traveller', traveller);
  const res = await fetch(`/api/attachments/${model}/${id}`, { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Something went wrong. Try again.');
  return data as BookingDoc[];
}

export function DocumentsPanel({ model, id, docs: initial, travellers, defaultKind, showPortal, title = 'Documents', emptyText, onChange }: {
  model: 'booking' | 'purchase' | 'expense'; id: string; docs: BookingDoc[]; travellers?: string[]; defaultKind: string; showPortal?: boolean;
  title?: string; emptyText: string; onChange?: (docs: BookingDoc[]) => void;
}) {
  const [docs, setDocs] = useState(initial);
  const [kind, setKind] = useState(defaultKind);
  const [trav, setTrav] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const base = `/api/attachments/${model}/${id}`;
  const done = (d: BookingDoc[]) => { setDocs(d); onChange?.(d); };

  async function send(res: Response) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || 'Something went wrong. Try again.');
    done(data as BookingDoc[]);
  }
  async function attach() {
    const f = input.current?.files?.[0];
    if (!f) return toast('Choose a file to attach.', 'err');
    setBusy(true);
    try { done(await uploadDoc(model, id, f, kind, trav)); if (input.current) input.current.value = ''; toast(`${f.name} attached.`); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function share(d: BookingDoc, on: boolean) {
    try { await send(await fetch(`${base}/${d.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shared: on ? 'yes' : 'no' }) })); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  async function remove(d: BookingDoc) {
    if (!window.confirm(`Remove ${d.name}? The file is deleted from storage.`)) return;
    try { await send(await fetch(`${base}/${d.id}`, { method: 'DELETE' })); toast('Document removed.'); }
    catch (e) { toast((e as Error).message, 'err'); }
  }

  return (
    <section className="sheet">
      <h2>{title}</h2>
      {docs.length ? (
        <div className="table-wrap">
          <table className="lines">
            <thead><tr><th>Type</th>{travellers && <th>Traveller</th>}<th>File</th><th>Added</th>{showPortal && <th>Portal</th>}<th><span className="sr">Actions</span></th></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>{label(DOC_KINDS, d.kind)}</td>
                  {travellers && <td>{d.traveller || 'Whole booking'}</td>}
                  <td>{d.name} <span className="muted">{fmtSize(d.size)}</span></td>
                  <td>{fmtDateTime(d.at)}<span className="muted" style={{ display: 'block', fontSize: 12.5 }}>{d.by}</span></td>
                  {showPortal && <td><label className="tgl"><input type="checkbox" checked={d.shared !== 'no'} onChange={(e) => share(d, e.target.checked)} />Shown</label></td>}
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <a className="btn" href={`${base}/${d.id}`} target="_blank" rel="noopener">View</a>{' '}
                    <a className="btn" href={`${base}/${d.id}?download=1`}>Download</a>
                    <button className="icon-btn" onClick={() => remove(d)} aria-label={`Remove ${d.name}`}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted" style={{ margin: 0 }}>{emptyText}</p>}
      <div className="addrow">
        <label className="sr" htmlFor={`doc-kind-${model}`}>Document type</label>
        <select id={`doc-kind-${model}`} value={kind} onChange={(e) => setKind(e.target.value)}>{DOC_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {travellers && <>
          <label className="sr" htmlFor="doc-trav">Traveller</label>
          <select id="doc-trav" value={trav} onChange={(e) => setTrav(e.target.value)}><option value="">Whole booking</option>{travellers.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        </>}
        <label className="sr" htmlFor={`doc-file-${model}`}>File</label>
        <input ref={input} id={`doc-file-${model}`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="filein" />
        <button className="btn primary" onClick={attach} disabled={busy}>{busy ? 'Uploading…' : 'Attach'}</button>
      </div>
      <p className="hint">Images or PDFs up to 4 MB; large photos are shrunk automatically. Files are stored privately and open only for signed-in users.{showPortal ? ' Untick Shown to keep a file out of the customer portal when it arrives.' : ''}</p>
    </section>
  );
}
