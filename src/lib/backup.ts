import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { gunzipSync, gzipSync } from 'zlib';
import { promises as fs } from 'fs';
import path from 'path';
import { BSON, ObjectId } from 'mongodb';
import { del, get, put } from '@vercel/blob';
import { db } from './db';
import { HttpError } from './api';
import { storageReady, storeOpts } from './attachments';

/**
 * Whole-database backups. Each backup is every collection in one file: compressed, then encrypted with a key
 * derived from AUTH_SECRET (so a copy that leaks is unreadable without it). Kept in the private file store
 * (Vercel Blob), with a list in the `backups` collection. Restoring puts every collection back as it was.
 */
const SKIP = new Set(['offers', 'enqlimits', 'backups', 'imports']); // short-lived caches, and the backup list itself
const key = () => createHash('sha256').update(`${process.env.AUTH_SECRET ?? ''}:backup`).digest();
const MAGIC = Buffer.from('TERPBAK1');

function seal(data: Buffer) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(gzipSync(data, { level: 9 })), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), enc]);
}
export function open(buf: Buffer): Buffer {
  if (buf.length < 36 || !buf.subarray(0, 8).equals(MAGIC)) throw new HttpError(400, 'That isn’t an ERP backup file.');
  try {
    const d = createDecipheriv('aes-256-gcm', key(), buf.subarray(8, 20));
    d.setAuthTag(buf.subarray(20, 36));
    return gunzipSync(Buffer.concat([d.update(buf.subarray(36)), d.final()]));
  } catch {
    throw new HttpError(400, 'This backup can’t be opened here: it was made by an ERP with a different AUTH_SECRET, or the file is damaged.');
  }
}

/* Storage: Vercel Blob in production; a local folder when BACKUP_DIR is set (tests, or a self-hosted server). */
async function save(name: string, buf: Buffer) {
  if (process.env.BACKUP_DIR) { await fs.mkdir(process.env.BACKUP_DIR, { recursive: true }); const p = path.join(process.env.BACKUP_DIR, name); await fs.writeFile(p, buf); return p; }
  if (!storageReady()) throw new HttpError(400, 'File storage isn’t connected, so backups can’t be saved. Connect the Vercel Blob store first.');
  const b = await put(`backups/${name}`, buf, { access: 'private', addRandomSuffix: true, contentType: 'application/octet-stream', ...storeOpts() });
  return b.pathname;
}
export async function load(p: string): Promise<Buffer> {
  if (process.env.BACKUP_DIR) return fs.readFile(p);
  const r = await get(p, { access: 'private', ...storeOpts() });
  if (!r || r.statusCode !== 200) throw new HttpError(404, 'Backup file not found in storage.');
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}
async function remove(p: string) {
  if (process.env.BACKUP_DIR) { await fs.unlink(p).catch(() => null); return; }
  await del(p, storeOpts()).catch((e) => console.error('Could not delete backup', e));
}

export type BackupRow = { id: string; name: string; kind: 'daily' | 'manual' | 'before-restore'; at: string; size: number; docs: number; collections: number; by: string };
const row = (d: Record<string, unknown>): BackupRow => ({ id: String(d._id), name: String(d.name), kind: d.kind as BackupRow['kind'], at: (d.at as Date).toISOString(), size: Number(d.size), docs: Number(d.docs), collections: Number(d.collections), by: String(d.by ?? '') });

/** Every collection, as a BSON document per collection, then sealed. */
export async function makeBackup(kind: BackupRow['kind'], by: string) {
  const d = await db();
  const names = (await d.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !SKIP.has(n) && !n.startsWith('system.')).sort();
  const parts: Buffer[] = [];
  let docs = 0;
  for (const n of names) {
    const rows = await d.collection(n).find({}).toArray();
    docs += rows.length;
    parts.push(Buffer.from(BSON.serialize({ c: n, rows })));
  }
  const header = Buffer.from(BSON.serialize({ format: 'travel-erp-backup', version: 1, at: new Date(), collections: names, docs }));
  const framed = Buffer.concat([header, ...parts]);
  const buf = seal(framed);
  // Date and time to the second, plus a random part: two backups never share a name.
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const name = `erp-${kind}-${stamp}-${randomBytes(3).toString('hex')}.bak`;
  const p = await save(name, buf);
  const ins = await d.collection('backups').insertOne({ name, path: p, kind, at: new Date(), size: buf.length, docs, collections: names.length, by });
  await prune();
  return row({ _id: ins.insertedId, name, kind, at: new Date(), size: buf.length, docs, collections: names.length, by });
}

/** Reads a backup file back into { collection: rows }. */
export function unpack(buf: Buffer) {
  const raw = open(buf);
  const out: Record<string, Record<string, unknown>[]> = {};
  let off = 0;
  let header: Record<string, unknown> | null = null;
  while (off < raw.length) {
    const len = raw.readInt32LE(off);
    const doc = BSON.deserialize(raw.subarray(off, off + len));
    off += len;
    if (!header) { header = doc; if (doc.format !== 'travel-erp-backup') throw new HttpError(400, 'That isn’t an ERP backup file.'); continue; }
    out[String(doc.c)] = doc.rows as Record<string, unknown>[];
  }
  return { header: header!, data: out };
}

/**
 * Puts every collection back exactly as in the backup. A "before restore" backup of the current state is taken
 * first, so a restore can itself be undone.
 */
export async function restore(id: string, by: string) {
  const d = await db();
  const b = await d.collection('backups').findOne({ _id: new ObjectId(id) });
  if (!b) throw new HttpError(404, 'Backup not found.');
  const { data } = unpack(await load(String(b.path)));
  const safety = await makeBackup('before-restore', by);
  // The audit log is never rolled back: it must keep the record of everything, including this restore.
  const KEEP = new Set(['audit']);
  const current = (await d.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !SKIP.has(n) && !KEEP.has(n) && !n.startsWith('system.'));
  for (const n of current) if (!(n in data)) await d.collection(n).deleteMany({});
  let docs = 0;
  for (const [n, rows] of Object.entries(data)) {
    if (KEEP.has(n)) continue;
    const col = d.collection(n);
    await col.deleteMany({});
    for (let i = 0; i < rows.length; i += 1000) if (rows.length) await col.insertMany(rows.slice(i, i + 1000) as never[], { ordered: false });
    docs += rows.length;
  }
  return { restored: Object.keys(data).length, docs, safety: safety.name, from: String(b.name) };
}

/** Keeps the last 14 daily backups, one a week for 8 weeks, the last 10 manual and 5 before-restore ones. */
async function prune() {
  const col = (await db()).collection('backups');
  const rows = await col.find({}).sort({ at: -1 }).toArray();
  const keep = new Set<string>();
  const daily = rows.filter((r) => r.kind === 'daily');
  daily.slice(0, 14).forEach((r) => keep.add(String(r._id)));
  const weeks = new Set<string>();
  for (const r of daily) {
    const t = r.at as Date; const wk = `${t.getUTCFullYear()}-${Math.floor((t.getTime() / 864e5 + 3) / 7)}`;
    if (!weeks.has(wk) && weeks.size < 8) { weeks.add(wk); keep.add(String(r._id)); }
  }
  rows.filter((r) => r.kind === 'manual').slice(0, 10).forEach((r) => keep.add(String(r._id)));
  rows.filter((r) => r.kind === 'before-restore').slice(0, 5).forEach((r) => keep.add(String(r._id)));
  for (const r of rows) if (!keep.has(String(r._id))) { await remove(String(r.path)); await col.deleteOne({ _id: r._id }); }
}

export async function listBackups() {
  const rows = await (await db()).collection('backups').find({}).sort({ at: -1 }).limit(60).toArray();
  return rows.map((r) => row(r));
}
