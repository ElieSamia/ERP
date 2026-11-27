import { headers } from 'next/headers';
import { ToastProvider } from '@/components/Toast';
import { getSession } from '@/lib/auth';
import { AREAS, accessFor, areaFor, can } from '@/lib/roles';
import { audit } from '@/lib/audit';

/**
 * Print pages share and send documents, so they need the same on-screen messages as the rest of the app.
 * They follow the role too: an invoice prints only for someone who can open Invoicing.
 */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (user) {
    const path = (await headers()).get('x-erp-path') ?? '';
    const area = areaFor(path);
    const access = await accessFor(user.sub, user.role);
    if (area && !can(access, area, 'view')) {
      await audit({ kind: 'denied', action: `Document refused (${access.roleName})`, who: user.name, whoId: user.sub, target: path });
      return <main className="main"><div className="empty" style={{ marginTop: 40 }}><h2 style={{ marginTop: 0 }}>No access</h2><p>Your role, <b>{access.roleName}</b>, doesn’t include {AREAS.find(([k]) => k === area)?.[1]}.</p></div></main>;
    }
  }
  return <ToastProvider>{children}</ToastProvider>;
}
