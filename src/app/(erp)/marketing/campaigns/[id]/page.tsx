import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getCampaign, getMarketingSettings, toAudience } from '@/lib/marketing';
import { CampaignEditor } from '@/components/CampaignEditor';

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const [c, user, s, auds] = await Promise.all([getCampaign((await params).id), getSession(), getMarketingSettings(), (await db()).collection('audiences').find({}).sort({ name: 1 }).toArray()]);
  if (!c) notFound();
  return <CampaignEditor key={c.id} initial={c} audiences={auds.map(toAudience)} provider={c.provider || s.provider} meEmail={user!.email} />;
}
