import { getSession } from '@/lib/auth';
import { contactNames, getAccSettings, getChart, journals } from '@/lib/accounting';
import { getFinance } from '@/lib/finance';
import { MoveForm } from '@/components/MoveForm';

export default async function NewEntry({ searchParams }: { searchParams: Promise<{ opening?: string }> }) {
  if ((await getSession())?.role !== 'admin') return <div className="empty">Only administrators can create journal entries.</div>;
  const [chart, fin, contacts, acc] = await Promise.all([getChart(), getFinance(), contactNames(), getAccSettings()]);
  return <MoveForm chart={chart} journals={journals(fin)} contacts={contacts} opening={(await searchParams).opening === '1'} openingOffset={acc.openingOffset} />;
}
