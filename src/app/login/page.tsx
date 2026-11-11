import { redirect } from 'next/navigation';
import { needsSetup } from '@/lib/queries';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await needsSetup()) redirect('/setup');
  return <LoginForm />;
}
