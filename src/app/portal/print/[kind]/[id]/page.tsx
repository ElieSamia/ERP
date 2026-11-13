import { notFound, redirect } from 'next/navigation';
import { canSeeBooking, getPortalCtx } from '@/lib/portal';
import { getInvoice } from '@/lib/finance';
import { supplierOrder } from '@/lib/portal';
import { loadDoc } from '@/lib/printdocs';
import { PrintButton } from '@/components/PrintBar';

export const dynamic = 'force-dynamic';

/** Printable documents for portal users, each checked against what their role may see. */
export default async function PortalPrint({ params, searchParams }: { params: Promise<{ kind: string; id: string }>; searchParams: Promise<{ pid?: string }> }) {
  const ctx = await getPortalCtx();
  if (!ctx) redirect('/portal/login');
  const { kind, id } = await params;
  const pid = (await searchParams).pid;
  const p = ctx.perms;
  let ok = false;
  if ((kind === 'confirm' || kind === 'vouchers') && ctx.side === 'customer') {
    const b = await canSeeBooking(ctx, id);
    ok = !!b && ['confirmed', 'ticketed', 'invoiced'].includes(b.status);
  } else if ((kind === 'invoice' || kind === 'receipt') && ctx.side === 'customer') {
    const inv = p.invoices === 'yes' ? await getInvoice(id) : null;
    ok = !!inv && inv.contactId === ctx.contactId && inv.status !== 'draft' && (kind === 'invoice' || inv.payments.some((x) => x.id === pid));
  } else if (kind === 'statement') {
    ok = ctx.side === 'customer' && p.statement === 'yes' && id === ctx.contactId;
  } else if (kind === 'supstatement') {
    ok = ctx.side === 'supplier' && p.statement === 'yes' && id === ctx.contactId;
  } else if (kind === 'po') {
    ok = !!(await supplierOrder(ctx, id));
  } else if (kind === 'voucher') {
    const po = p.payments === 'yes' ? await supplierOrder(ctx, id) : null;
    ok = !!po && po.payments.some((x) => x.id === pid);
  }
  if (!ok) notFound();
  const doc = await loadDoc(kind as 'confirm' | 'vouchers' | 'invoice' | 'receipt' | 'statement' | 'supstatement' | 'po' | 'voucher', id, pid, { prices: kind === 'confirm' && p.prices === 'yes' });
  if (!doc) notFound();
  return (
    <div className="printpage">
      <div className="doc-toolbar noprint"><PrintButton /><span className="muted">To get a PDF, choose Save as PDF in the print dialog.</span></div>
      {doc.node}
    </div>
  );
}
