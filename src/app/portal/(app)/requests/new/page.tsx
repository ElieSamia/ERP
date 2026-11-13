import { redirect } from 'next/navigation';
import { getPortalCtx } from '@/lib/portal';
import { NewRequestForm } from '@/components/RequestPortal';

export default async function NewPortalRequest() {
  const ctx = await getPortalCtx();
  if (!ctx) redirect('/portal/login');
  if (ctx.perms.requests !== 'create') return <div className="empty">Your access doesn’t include sending requests.</div>;
  return <NewRequestForm />;
}
