import { notFound } from 'next/navigation';
import { getFinance, getInvoice, listInvoices } from '@/lib/finance';
import { getAccSettings } from '@/lib/accounting';
import { docTotals } from '@/lib/constants';
import { InvoiceForm } from '@/components/InvoiceForm';

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const [inv, finance] = await Promise.all([getInvoice((await params).id), getFinance()]);
  if (!inv) notFound();
  const acc = await getAccSettings();
  // Other open invoices of this customer in the same currency, where remaining credit can be applied.
  const targets = (await listInvoices({ status: 'posted' })).filter((i) => i.contactId === inv.contactId && i.id !== inv.id && i.currency === inv.currency)
    .map((i) => ({ id: i.id, ref: i.number ?? '', balance: docTotals(i.lines, i.payments).balance })).filter((x) => x.balance > 0.004);
  return <InvoiceForm key={inv.id} initial={inv} finance={finance} currencies={acc.currencies.map((c) => ({ code: c.code, rate: c.rate }))} targets={targets} />;
}
