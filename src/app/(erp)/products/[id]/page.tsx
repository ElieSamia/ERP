import { notFound } from 'next/navigation';
import { getPricing, listSuppliers } from '@/lib/bookings';
import { getFinance } from '@/lib/finance';
import { getProduct } from '@/lib/products';
import { ProductForm } from '@/components/ProductForm';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const [p, suppliers, pricing, fin] = await Promise.all([getProduct((await params).id), listSuppliers(), getPricing(), getFinance()]);
  if (!p) notFound();
  return <ProductForm key={p.id} initial={p} suppliers={suppliers} pricing={pricing} vatDefaults={fin.vat} />;
}
