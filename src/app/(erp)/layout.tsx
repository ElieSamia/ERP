import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getCompany } from '@/lib/queries';
import { TopBar } from '@/components/TopBar';
import { ToastProvider } from '@/components/Toast';
import { getAppearance, getBranding } from '@/lib/branding';

export const dynamic = 'force-dynamic';

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect('/login');
  const [company, a, b] = await Promise.all([getCompany(), getAppearance(), getBranding()]);
  return (
    <ToastProvider>
      <TopBar company={company.name} userName={user.name} logo={a.showLogo && !!b.logo} />
      <main className="main">{children}</main>
    </ToastProvider>
  );
}
