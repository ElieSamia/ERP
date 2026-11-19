import { ObjectId } from 'mongodb';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getCompany, listUsers } from '@/lib/queries';
import { CompanyForm, UsersPanel } from '@/components/Settings';
import { PricingForm } from '@/components/PricingForm';
import { getPricing } from '@/lib/bookings';
import { getFinance } from '@/lib/finance';
import { FinanceSettings } from '@/components/FinanceSettings';
import { MailSettings } from '@/components/MailSettings';
import { DocumentLayouts } from '@/components/DocumentLayouts';
import { TwoStepPanel } from '@/components/TwoStepPanel';
import { AppearanceSettings } from '@/components/AppearanceSettings';
import { getAppearance, getBranding } from '@/lib/branding';
import { getMailSettings, recentEmails } from '@/lib/mail';

export default async function SettingsPage() {
  const user = (await getSession())!;
  const isAdmin = user.role === 'admin';
  const [company, users, pricing, finance, mail, log] = await Promise.all([getCompany(), isAdmin ? listUsers() : Promise.resolve([]), getPricing(), getFinance(), isAdmin ? getMailSettings() : null, isAdmin ? recentEmails() : []]);
  const me = await (await db()).collection('users').findOne({ _id: new ObjectId(user.sub) }, { projection: { totpEnabled: 1, recoveryHashes: 1 } });
  const twoStep = { enabled: !!me?.totpEnabled, recoveryLeft: (me?.recoveryHashes as string[] | undefined)?.length ?? 0 };
  return (
    <>
      <div className="cp"><div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Settings</h1></div></div>
      <TwoStepPanel initial={twoStep} />
      <CompanyForm initial={company} canEdit={isAdmin} />
      <PricingForm initial={pricing} canEdit={isAdmin} />
      <FinanceSettings initial={finance} canEdit={isAdmin} />
      {isAdmin && <DocumentLayouts initial={await getBranding()} company={company} />}
      {isAdmin && <AppearanceSettings initial={await getAppearance()} />}
      {isAdmin && mail && <MailSettings initial={mail} log={log} meEmail={user.email} />}
      {isAdmin && <UsersPanel initial={users} meId={user.sub} />}
    </>
  );
}
