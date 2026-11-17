import { getPricing, listSuppliers } from '@/lib/bookings';
import { getFinance } from '@/lib/finance';
import { ProductForm } from '@/components/ProductForm';

export default async function NewProduct() {
  const [suppliers, pricing, fin] = await Promise.all([listSuppliers(), getPricing(), getFinance()]);
  return <ProductForm suppliers={suppliers} pricing={pricing} vatDefaults={fin.vat} />;
}
