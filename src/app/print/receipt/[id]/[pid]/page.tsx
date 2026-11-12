import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { loadDoc } from '@/lib/printdocs';
import { PrintBar } from '@/components/PrintBar';

export const dynamic = 'force-dynamic';

export default async function PrintReceipt({ params }: { params: Promise<{ id: string; pid: string }> }) {
  if (!(await getSession())) redirect('/login');
  const { id, pid } = await params;
  const doc = await loadDoc('receipt', id, pid);
  if (!doc) notFound();
  return (
    <div className="printpage">
      <PrintBar back={doc.back} backLabel={doc.backLabel} share={{ kind: 'receipt', id, pid }} />
      {doc.node}
    </div>
  );
}
