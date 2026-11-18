import { notFound } from 'next/navigation';
import { getFinance, getPurchase } from '@/lib/finance';
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
  return <PurchaseForm key={po.id} initial={po} finance={finance} suppliers={suppliers} supplierPortal={users > 0} />;
}
