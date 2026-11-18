import { notFound } from 'next/navigation';
import { EMPTY_FILTER, getAudience } from '@/lib/marketing';
import { AudienceEditor } from '@/components/AudienceEditor';

export default async function AudiencePage({ params }: { params: Promise<{ id: string }> }) {
  const a = await getAudience((await params).id);
  if (!a) notFound();
  return <AudienceEditor key={a.id} initial={a} empty={EMPTY_FILTER} />;
}
