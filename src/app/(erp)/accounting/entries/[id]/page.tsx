import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { contactNames, getAccSettings, getChart, getMove, journals } from '@/lib/accounting';
import { getFinance } from '@/lib/finance';
import { MoveForm } from '@/components/MoveForm';

const SOURCE: Record<string, string> = { invoice: '/invoicing/', purchase: '/purchasing/', expense: '/expenses/' };

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  if ((await getSession())?.role !== 'admin') return <div className="empty">Only administrators can open journal entries.</div>;
  const [m, chart, fin, contacts, acc] = await Promise.all([getMove((await params).id), getChart(), getFinance(), contactNames(), getAccSettings()]);
  if (!m) notFound();
  const src = m.origin && SOURCE[m.origin.model] ? `${SOURCE[m.origin.model]}${m.origin.id}` : undefined;
  return <MoveForm key={m.id} initial={m} chart={chart} journals={journals(fin)} contacts={contacts} sourceHref={src} openingOffset={acc.openingOffset} />;
}
