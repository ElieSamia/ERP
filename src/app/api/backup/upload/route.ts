import { db } from '@/lib/db';
import { handle, HttpError, requireUser } from '@/lib/api';
import { unpack } from '@/lib/backup';
import { listBackups } from '@/lib/backup';

export const maxDuration = 60;

/**
 * Brings back a backup file kept elsewhere (for example on your computer), so it can be restored from the list.
 * Checked first: it must open with this ERP's AUTH_SECRET.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser('admin');
    const form = await req.formData().catch(() => { throw new HttpError(400, 'Send the backup as a file upload.'); });
    const f = form.get('file');
    if (!(f instanceof File)) throw new HttpError(400, 'Choose the backup file.');
    if (f.size > 4 * 1024 * 1024) throw new HttpError(400, 'That file is over 4 MB, the upload limit here. Ask for help restoring it directly.');
    const buf = Buffer.from(await f.arrayBuffer());
    const { header, data } = unpack(buf);
    const { promises: fs } = await import('fs');
    const name = `uploaded-${f.name.replace(/[^\w.-]/g, '_').slice(0, 60)}`;
    let p: string;
    if (process.env.BACKUP_DIR) { p = `${process.env.BACKUP_DIR}/${name}`; await fs.mkdir(process.env.BACKUP_DIR, { recursive: true }); await fs.writeFile(p, buf); }
    else { const { put } = await import('@vercel/blob'); const { storeOpts } = await import('@/lib/attachments'); p = (await put(`backups/${name}`, buf, { access: 'private', addRandomSuffix: true, ...storeOpts() })).pathname; }
    await (await db()).collection('backups').insertOne({ name, path: p, kind: 'manual', at: new Date(), size: buf.length, docs: Number(header.docs ?? Object.values(data).reduce((n, r) => n + r.length, 0)), collections: Object.keys(data).length, by: `${user.name} (uploaded)` });
    return { backups: await listBackups() };
  });
}
