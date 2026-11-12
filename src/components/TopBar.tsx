'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { api } from '@/lib/client';

export const MODULES = [
  { href: '/crm', name: 'CRM' },
  { href: '/bookings', name: 'Bookings' },
  { href: '/invoicing', name: 'Invoicing' },
  { href: '/purchasing', name: 'Purchasing' },
  { href: '/expenses', name: 'Expenses' },
  { href: '/accounting', name: 'Accounting' },
  { href: '/contacts', name: 'Contacts' },
  { href: '/settings', name: 'Settings' },
];

export function TopBar({ company, userName }: { company: string; userName: string }) {
  const path = usePathname();
  const router = useRouter();
  const cur = MODULES.find((m) => path.startsWith(m.href));
  async function signOut() {
    await api('/api/auth/logout', 'POST').catch(() => null);
    router.push('/login');
    router.refresh();
  }
  return (
    <header className="topbar">
      <Link className="appsbtn" href="/" aria-label="All apps" title="All apps"><Icon name="grid" /></Link>
      <span className="brand">{cur ? cur.name : company || 'Travel ERP'}</span>
      {cur ? (
        <nav className="modnav" aria-label="Apps">
          {MODULES.map((m) => (
            <Link key={m.href} href={m.href} className={m.href === cur.href ? 'on' : ''} aria-current={m.href === cur.href ? 'page' : undefined}>{m.name}</Link>
          ))}
        </nav>
      ) : <span className="spacer" />}
      <span className="who">{userName}</span>
      <button className="signout" onClick={signOut}>Sign out</button>
    </header>
  );
}
