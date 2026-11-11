import { redirect } from 'next/navigation';
import { needsSetup } from '@/lib/queries';
import { SetupForm } from './SetupForm';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (!(await needsSetup())) redirect('/login');
  return <SetupForm />;
}
