import { db } from '@/lib/db';
import { notFound } from 'next/navigation';
import { EMPTY_FILTER, getAudience } from '@/lib/marketing';
import { AudienceEditor } from '@/components/AudienceEditor';

export default async function AudiencePage({ params }: { params: Promise<{ id: string }> }) {
  const a = await getAudience((await params).id);
  if (!a) notFound();
  const tags = ((await (await db()).collection('contacts').distinct('tags')) as string[]).filter(Boolean).sort();
  return <AudienceEditor key={a.id} initial={a} empty={EMPTY_FILTER} allTags={tags} />;
}
