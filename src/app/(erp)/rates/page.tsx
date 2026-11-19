import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getPricing, listSuppliers } from '@/lib/bookings';
import { listConnections } from '@/lib/rates';
import { PROVIDERS } from '@/lib/rates/registry';
import { Tabs } from '@/components/ListChrome';
import { RatesDesk } from '@/components/RatesDesk';
import { ConnectionsPanel } from '@/components/ConnectionsPanel';

export default async function RatesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = (await getSession())!;
  const tab = (await searchParams).tab === 'connections' && user.role === 'admin' ? 'connections' : 'search';
  const d = await db();
  const conns = await listConnections();
  const tabs: [string, string][] = [['search', 'Search'], ...(user.role === 'admin' ? [['connections', 'Connections'] as [string, string]] : [])];
  let body: React.ReactNode;
  if (tab === 'connections') {
    body = <ConnectionsPanel initial={conns} providers={PROVIDERS.map((p) => ({ id: p.id, name: p.name, kinds: p.kinds, description: p.description, fields: p.fields }))} suppliers={await listSuppliers()} />;
  } else {
    const [cs, drafts, reqs, pricing] = await Promise.all([
      d.collection('contacts').find({ type: { $ne: 'supplier' } }, { projection: { name: 1, type: 1 } }).sort({ name: 1 }).limit(1000).toArray(),
      d.collection('bookings').find({ status: 'draft' }, { projection: { ref: 1, contactId: 1, destinationName: 1 } }).sort({ createdAt: -1 }).limit(200).toArray(),
      d.collection('requests').find({ status: { $in: ['submitted', 'review', 'quoted'] } }, { projection: { ref: 1, title: 1, contactId: 1 } }).sort({ createdAt: -1 }).limit(200).toArray(),
      getPricing(),
    ]);
    const cname = (id: unknown) => String(cs.find((c) => String(c._id) === String(id))?.name ?? '');
    body = <RatesDesk customers={cs.map((c) => ({ id: String(c._id), name: String(c.name), type: String(c.type) }))} pricing={pricing}
      drafts={drafts.map((b) => ({ id: String(b._id), contactId: String(b.contactId), label: `${b.ref}, ${cname(b.contactId)}${b.destinationName ? `, ${b.destinationName}` : ''}` }))}
      requests={reqs.map((q) => ({ id: String(q._id), contactId: String(q.contactId), label: `${q.ref}, ${q.title}, ${cname(q.contactId)}` }))}
      hasConnections={conns.some((c) => c.active)} />;
  }
  return (
    <>
      <div className="cp"><div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Rates desk</h1></div><Tabs base="/rates" current={tab} items={tabs} /></div>
      {body}
    </>
  );
}
