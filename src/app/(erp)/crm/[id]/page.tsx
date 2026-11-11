import { notFound } from 'next/navigation';
import { getLead } from '@/lib/queries';
import { LeadForm } from '@/components/LeadForm';

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const l = await getLead((await params).id);
  if (!l) notFound();
  return <LeadForm key={l.id} initial={l} />;
}
