import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { loadDoc } from '@/lib/printdocs';
import { PrintBar } from '@/components/PrintBar';

export const dynamic = 'force-dynamic';

/** Booking confirmation. Prices are hidden unless ?prices=1, since prices belong on the invoice. */
export default async function PrintBooking({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ prices?: string }> }) {
  if (!(await getSession())) redirect('/login');
  const { id } = await params;
  const prices = (await searchParams).prices === '1';
  const doc = await loadDoc('confirm', id, undefined, { prices });
  if (!doc) notFound();
  return (
    <div className="printpage">
      <PrintBar back={doc.back} backLabel={doc.backLabel} share={{ kind: 'confirm', id, prices }}
        toggle={{ href: `/print/booking/${id}${prices ? '' : '?prices=1'}`, label: prices ? 'Hide prices' : 'Show prices' }} />
      {doc.node}
    </div>
  );
}
