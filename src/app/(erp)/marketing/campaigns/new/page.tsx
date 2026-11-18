import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getMarketingSettings, toAudience } from '@/lib/marketing';
import { CampaignEditor } from '@/components/CampaignEditor';

export default async function NewCampaign() {
  const [user, s, auds] = await Promise.all([getSession(), getMarketingSettings(), (await db()).collection('audiences').find({}).sort({ name: 1 }).toArray()]);
  return <CampaignEditor audiences={auds.map(toAudience)} provider={s.provider} meEmail={user!.email} />;
}
