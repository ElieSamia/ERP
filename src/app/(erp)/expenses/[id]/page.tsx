import { notFound } from 'next/navigation';
import { getExpense, getFinance } from '@/lib/finance';
import { listSuppliers } from '@/lib/bookings';
import { ExpenseForm } from '@/components/ExpenseForm';

export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const [e, finance, suppliers] = await Promise.all([getExpense((await params).id), getFinance(), listSuppliers()]);
  if (!e) notFound();
  return <ExpenseForm key={e.id} initial={e} finance={finance} suppliers={suppliers} />;
}
