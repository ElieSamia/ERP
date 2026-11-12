import { getFinance } from '@/lib/finance';
import { listSuppliers } from '@/lib/bookings';
import { PurchaseForm } from '@/components/PurchaseForm';

export default async function NewPurchase() {
  const [finance, suppliers] = await Promise.all([getFinance(), listSuppliers()]);
  return <PurchaseForm finance={finance} suppliers={suppliers} />;
}
