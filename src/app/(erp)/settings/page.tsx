import { getSession } from '@/lib/auth';
import { getCompany, listUsers } from '@/lib/queries';
import { CompanyForm, UsersPanel } from '@/components/Settings';
import { PricingForm } from '@/components/PricingForm';
import { getPricing } from '@/lib/bookings';
import { getFinance } from '@/lib/finance';
import { FinanceSettings } from '@/components/FinanceSettings';

export default async function SettingsPage() {
  const user = (await getSession())!;
  const isAdmin = user.role === 'admin';
  const [company, users, pricing, finance] = await Promise.all([getCompany(), isAdmin ? listUsers() : Promise.resolve([]), getPricing(), getFinance()]);
  return (
    <>
      <div className="cp"><div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Settings</h1></div></div>
      <CompanyForm initial={company} canEdit={isAdmin} />
      <PricingForm initial={pricing} canEdit={isAdmin} />
      <FinanceSettings initial={finance} canEdit={isAdmin} />
      {isAdmin && <UsersPanel initial={users} meId={user.sub} />}
    </>
  );
}
