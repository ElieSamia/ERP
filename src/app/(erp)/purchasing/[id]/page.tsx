import { notFound } from 'next/navigation';
import { getFinance, getPurchase, listPurchases } from '@/lib/finance';
import { docTotals } from '@/lib/constants';
import { listSuppliers } from '@/lib/bookings';
import { PurchaseForm } from '@/components/PurchaseForm';
import { db } from '@/lib/db';

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const [po, finance, suppliers] = await Promise.all([getPurchase((await params).id), getFinance(), listSuppliers()]);
  if (!po) notFound();
  // Whether this supplier can see the order: portal access on, and at least one active person who has signed in or been invited.
  const d = await db();
  const c = po.supplierId ? await d.collection('contacts').findOne({ _id: new (await import('mongodb')).ObjectId(po.supplierId) }, { projection: { portalAccess: 1 } }).catch(() => null) : null;
  const users = c?.portalAccess === 'yes' ? await d.collection('portalUsers').countDocuments({ contactId: po.supplierId, active: { $ne: false } }) : 0;
  const targets = (await listPurchases({ status: 'billed' })).filter((p) => p.supplierId === po.supplierId && p.id !== po.id)
    .map((p) => ({ id: p.id, ref: p.billRef || p.ref, balance: docTotals(p.lines, p.payments).balance })).filter((x) => x.balance > 0.004);
  return <PurchaseForm key={po.id} initial={po} finance={finance} suppliers={suppliers} supplierPortal={users > 0} targets={targets} />;
}
