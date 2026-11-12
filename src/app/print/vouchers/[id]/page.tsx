import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { loadDoc } from '@/lib/printdocs';
import { PrintBar } from '@/components/PrintBar';

export const dynamic = 'force-dynamic';

export default async function PrintVouchers({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) redirect('/login');
  const { id } = await params;
  const doc = await loadDoc('vouchers', id);
  if (!doc) notFound();
  return (
    <div className="printpage">
      <PrintBar back={doc.back} backLabel={doc.backLabel} share={{ kind: 'vouchers', id }} />
      {doc.node}
    </div>
  );
}
