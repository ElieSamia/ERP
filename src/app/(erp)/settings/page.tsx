import { getSession } from '@/lib/auth';
import { getCompany, listUsers } from '@/lib/queries';
import { CompanyForm, UsersPanel } from '@/components/Settings';
import { PricingForm } from '@/components/PricingForm';
import { getPricing } from '@/lib/bookings';
import { getFinance } from '@/lib/finance';
import { FinanceSettings } from '@/components/FinanceSettings';
import { MailSettings } from '@/components/MailSettings';
import { getMailSettings, recentEmails } from '@/lib/mail';

export default async function SettingsPage() {
  const user = (await getSession())!;
  const isAdmin = user.role === 'admin';
  const [company, users, pricing, finance, mail, log] = await Promise.all([getCompany(), isAdmin ? listUsers() : Promise.resolve([]), getPricing(), getFinance(), isAdmin ? getMailSettings() : null, isAdmin ? recentEmails() : []]);
  return (
    <>
      <div className="cp"><div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Settings</h1></div></div>
      <CompanyForm initial={company} canEdit={isAdmin} />
      <PricingForm initial={pricing} canEdit={isAdmin} />
      <FinanceSettings initial={finance} canEdit={isAdmin} />
      {isAdmin && mail && <MailSettings initial={mail} log={log} meEmail={user.email} />}
      {isAdmin && <UsersPanel initial={users} meId={user.sub} />}
    </>
  );
}
