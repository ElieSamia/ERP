import { ToastProvider } from '@/components/Toast';

/** Print pages share and send documents, so they need the same on-screen messages as the rest of the app. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
