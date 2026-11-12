import { notFound } from 'next/navigation';
import { getFinance, getInvoice } from '@/lib/finance';
import { InvoiceForm } from '@/components/InvoiceForm';

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const [inv, finance] = await Promise.all([getInvoice((await params).id), getFinance()]);
  if (!inv) notFound();
  return <InvoiceForm key={inv.id} initial={inv} finance={finance} />;
}
