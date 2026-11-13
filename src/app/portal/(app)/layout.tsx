import { redirect } from 'next/navigation';
import { getPortalCtx } from '@/lib/portal';
import { getCompany } from '@/lib/queries';
import { PortalBar } from '@/components/PortalBar';
import { ToastProvider } from '@/components/Toast';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getPortalCtx();
  if (!ctx) redirect('/portal/login');
  const c = await getCompany();
  const p = ctx.perms;
  const links: [string, string][] = [['/portal', 'Dashboard']];
  if (p.requests !== 'none') links.push(['/portal/requests', 'Requests']);
  if (p.bookings !== 'none') links.push(['/portal/bookings', 'Bookings']);
  if (p.invoices === 'yes') links.push(['/portal/invoices', 'Invoices']);
  if (p.statement === 'yes') links.push(['/portal/statement', 'Statement']);
  if (p.manageUsers === 'yes') links.push(['/portal/team', 'Team']);
  return (
    <ToastProvider>
      <PortalBar company={c.name || 'Portal'} account={ctx.contactName} user={ctx.name} links={links} />
      <main className="main">{children}</main>
    </ToastProvider>
  );
}
