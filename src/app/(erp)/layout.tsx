import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getCompany } from '@/lib/queries';
import { TopBar } from '@/components/TopBar';
import { ToastProvider } from '@/components/Toast';
import { getAppearance, getBranding } from '@/lib/branding';
import { headers } from 'next/headers';
import Link from 'next/link';
import { AREAS, accessFor, areaFor, can } from '@/lib/roles';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect('/login');
  const [company, a, b] = await Promise.all([getCompany(), getAppearance(), getBranding()]);
  // The role decides which apps open and which appear in the menu.
  const access = await accessFor(user.sub, user.role);
  const path = (await headers()).get('x-erp-path') ?? '';
  const area = areaFor(path);
  const denied = !!area && !can(access, area, 'view');
  if (denied) await audit({ kind: 'denied', action: `Page refused (${access.roleName})`, who: user.name, whoId: user.sub, target: path });
  const allowed = AREAS.filter(([k]) => can(access, k, 'view')).map(([k]) => k);
  return (
    <ToastProvider>
      <TopBar company={company.name} userName={user.name} logo={a.showLogo && !!b.logo} allowed={access.admin ? undefined : allowed} />
      <main className="main">{denied ? (
        <div className="empty" style={{ marginTop: 40 }}>
          <h2 style={{ marginTop: 0 }}>No access</h2>
          <p>Your role, <b>{access.roleName}</b>, doesn’t include {AREAS.find(([k]) => k === area)?.[1]}. Ask an administrator if you need it.</p>
          <p><Link className="btn" href="/">Back to the dashboard</Link></p>
        </div>
      ) : children}</main>
    </ToastProvider>
  );
}
