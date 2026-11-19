import { db } from '@/lib/db';
import { handle, HttpError, requireUser } from '@/lib/api';
import { listConnections, sealCredentials } from '@/lib/rates';
import { PROVIDERS, providerMeta } from '@/lib/rates/registry';
import { connectionSchema as schema } from '@/lib/schemas';

export async function GET() {
  return handle(async () => {
    await requireUser('admin');
    return { connections: await listConnections(), providers: PROVIDERS.map((p) => ({ id: p.id, name: p.name, kinds: p.kinds, description: p.description, fields: p.fields })) };
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser('admin');
    const d = schema.parse(await req.json());
    const meta = providerMeta(d.provider);
    if (!meta) throw new HttpError(400, 'Choose a provider.');
    if (d.kinds.some((k) => !meta.kinds.includes(k))) throw new HttpError(400, `${meta.name} doesn’t sell all of those.`);
    await (await db()).collection('connections').insertOne({ provider: d.provider, name: d.name, kinds: d.kinds, mode: d.mode, supplierId: d.supplierId, active: d.active, credentialsEnc: sealCredentials(d.credentials), createdAt: new Date(), createdBy: user.name });
    return listConnections();
  });
}
