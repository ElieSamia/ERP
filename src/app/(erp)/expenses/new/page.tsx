import { getFinance } from '@/lib/finance';
import { listSuppliers } from '@/lib/bookings';
import { ExpenseForm } from '@/components/ExpenseForm';

export default async function NewExpense() {
  const [finance, suppliers] = await Promise.all([getFinance(), listSuppliers()]);
  return <ExpenseForm finance={finance} suppliers={suppliers} />;
}
