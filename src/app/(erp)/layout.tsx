import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getCompany } from '@/lib/queries';
import { TopBar } from '@/components/TopBar';
import { ToastProvider } from '@/components/Toast';

export const dynamic = 'force-dynamic';

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect('/login');
  const company = await getCompany();
  return (
    <ToastProvider>
      <TopBar company={company.name} userName={user.name} />
      <main className="main">{children}</main>
    </ToastProvider>
  );
}
