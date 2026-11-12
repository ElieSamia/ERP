import { notFound } from 'next/navigation';
import { getFinance, getPurchase } from '@/lib/finance';
import { listSuppliers } from '@/lib/bookings';
import { PurchaseForm } from '@/components/PurchaseForm';

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const [po, finance, suppliers] = await Promise.all([getPurchase((await params).id), getFinance(), listSuppliers()]);
  if (!po) notFound();
  return <PurchaseForm key={po.id} initial={po} finance={finance} suppliers={suppliers} />;
}
