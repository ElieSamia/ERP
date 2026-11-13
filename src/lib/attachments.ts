import { randomUUID } from 'crypto';
import { put, del, get } from '@vercel/blob';
import { db } from './db';
import { HttpError, oid } from './api';
import { logActivity } from './activity';
import { DOC_KINDS, label } from './constants';
import type { BookingDoc } from './types';

/** Records that can carry files, and the collection each lives in. */
export const ATTACH_MODELS = { booking: 'bookings', purchase: 'purchases', expense: 'expenses' } as const;
export type AttachModel = keyof typeof ATTACH_MODELS;
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Vercel names the store variable after the prefix chosen when connecting it: BLOB_STORE_ID by default,
 * but for example BLOB_READ_WRITE_TOKEN_STORE_ID with another prefix. Accept any of them, plus the older token.
 */
function blobStoreId() {
  if (process.env.BLOB_STORE_ID) return process.env.BLOB_STORE_ID;
  const key = Object.keys(process.env).find((k) => /^BLOB\w*_STORE_ID$/.test(k) && process.env[k]);
  return key ? process.env[key] : undefined;
}
const storeOpts = () => { const storeId = blobStoreId(); return storeId ? { storeId } : {}; };
const storageReady = () => !!(process.env.BLOB_READ_WRITE_TOKEN || blobStoreId());
type StoredDoc = BookingDoc & { pathname?: string };

export function attachModel(m: string): AttachModel {
  if (!(m in ATTACH_MODELS)) throw new HttpError(404, 'Not found.');
  return m as AttachModel;
}
const col = async (m: AttachModel) => (await db()).collection(ATTACH_MODELS[m]);

/** The file list as the browser sees it: storage paths never leave the server. */
export const publicDocs = (docs: unknown): BookingDoc[] => ((docs as StoredDoc[]) || []).map((x) => ({
  id: x.id, kind: x.kind, traveller: x.traveller || '', name: x.name, size: x.size, type: x.type, at: x.at, by: x.by, shared: x.shared === 'no' ? 'no' : 'yes',
}));

async function docsOf(m: AttachModel, id: string) {
  const r = await (await col(m)).findOne({ _id: oid(id) }, { projection: { docs: 1 } });
  if (!r) throw new HttpError(404, 'Record not found.');
  return (r.docs as StoredDoc[]) || [];
}

/** Uploads one file to the private Blob store and adds it to the record. */
export async function attach(m: AttachModel, id: string, form: FormData, by: string) {
  if (!storageReady())
    throw new HttpError(503, 'File storage isn’t connected yet. In Vercel, open Storage, create a private Blob store and connect it to this project.');
  await docsOf(m, id);
  const file = form.get('file');
  if (!(file instanceof File) || !file.size) throw new HttpError(400, 'Choose a file to attach.');
  if (file.size > MAX_BYTES) throw new HttpError(413, 'That file is over 4 MB. Attach a smaller file.');
  if (!/^image\/(jpeg|png|webp|gif)$|^application\/pdf$/.test(file.type)) throw new HttpError(415, 'Attach a JPG, PNG or WebP image, or a PDF.');
  const kind = String(form.get('kind') || 'other');
  if (!DOC_KINDS.some(([k]) => k === kind)) throw new HttpError(400, 'Choose the document type.');
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80) || 'file';
  const blob = await put(`${ATTACH_MODELS[m]}/${id}/${safe}`, file, { access: 'private', addRandomSuffix: true, contentType: file.type, ...storeOpts() });
  const doc: StoredDoc = {
    id: randomUUID(), kind, traveller: String(form.get('traveller') || '').slice(0, 120), name: file.name.slice(0, 160), size: file.size, type: file.type,
    pathname: blob.pathname, at: new Date().toISOString(), by, shared: 'yes',
  };
  await (await col(m)).updateOne({ _id: oid(id) }, { $push: { docs: doc } } as never);
  await logActivity(m, id, by, `${label(DOC_KINDS, kind)} attached: ${doc.name}.`);
  return publicDocs(await docsOf(m, id));
}

export async function setShared(m: AttachModel, id: string, docId: string, shared: 'yes' | 'no', by: string) {
  const r = await (await col(m)).updateOne({ _id: oid(id), 'docs.id': docId }, { $set: { 'docs.$.shared': shared } });
  if (!r.matchedCount) throw new HttpError(404, 'Document not found.');
  await logActivity(m, id, by, shared === 'yes' ? 'A document was made visible in the portal.' : 'A document was made internal only.');
  return publicDocs(await docsOf(m, id));
}

export async function removeDoc(m: AttachModel, id: string, docId: string, by: string) {
  const doc = (await docsOf(m, id)).find((x) => x.id === docId);
  if (!doc) throw new HttpError(404, 'Document not found.');
  if (doc.pathname) await del(doc.pathname, storeOpts()).catch((e) => console.error('Could not delete file', e));
  await (await col(m)).updateOne({ _id: oid(id) }, { $pull: { docs: { id: docId } } } as never);
  await logActivity(m, id, by, `Document removed: ${doc.name}.`);
  return publicDocs(await docsOf(m, id));
}

/** Deletes every stored file of a record, used when a draft record is deleted. */
export async function removeAllFiles(docs: unknown) {
  const paths = ((docs as StoredDoc[]) || []).map((x) => x.pathname).filter((x): x is string => !!x);
  if (paths.length) await del(paths, storeOpts()).catch((e) => console.error('Could not delete files', e));
}

export async function openFile(m: AttachModel, id: string, docId: string, download: boolean) {
  const doc = (await docsOf(m, id)).find((x) => x.id === docId);
  if (!doc?.pathname) throw new HttpError(404, 'File not found.');
  const res = await get(doc.pathname, { access: 'private', ...storeOpts() });
  if (!res || res.statusCode !== 200) throw new HttpError(404, 'File not found in storage.');
  return new Response(res.stream, {
    headers: {
      'Content-Type': doc.type,
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
