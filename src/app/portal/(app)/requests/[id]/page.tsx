import { notFound, redirect } from 'next/navigation';
import { getPortalCtx, getPortalSettings, getRequestDoc, toRequest } from '@/lib/portal';
import { RequestPortal } from '@/components/RequestPortal';

export default async function PortalRequest({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPortalCtx();
  if (!ctx) redirect('/portal/login');
  const doc = await getRequestDoc((await params).id);
  if (!doc || doc.contactId !== ctx.contactId || ctx.perms.requests === 'none' || (ctx.perms.scope === 'own' && doc.createdById !== ctx.userId)) notFound();
  const s = await getPortalSettings();
  const r = toRequest(doc);
  return <RequestPortal key={r.id} initial={r} perms={ctx.perms} response={s.response} uploads={s.uploads === 'yes'} />;
}
