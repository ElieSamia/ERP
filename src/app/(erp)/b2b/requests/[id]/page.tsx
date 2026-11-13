import { notFound } from 'next/navigation';
import { getPortalSettings, getRequestDoc, requestWithNames, toRequest } from '@/lib/portal';
import { RequestStaff } from '@/components/RequestStaff';

export default async function StaffRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const doc = await getRequestDoc((await params).id);
  if (!doc) notFound();
  const [r, s] = await Promise.all([requestWithNames(toRequest(doc)), getPortalSettings()]);
  return <RequestStaff key={r.id} initial={r} quoteDays={s.quoteDays} />;
}
