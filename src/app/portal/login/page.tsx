import { Suspense } from 'react';
import { getCompany } from '@/lib/queries';
import { PortalLoginForm } from '@/components/PortalAuthForms';
import { ToastProvider } from '@/components/Toast';

export const dynamic = 'force-dynamic';

export default async function PortalLogin() {
  const c = await getCompany();
  return <ToastProvider><Suspense><PortalLoginForm company={c.name || 'Our'} /></Suspense></ToastProvider>;
}
