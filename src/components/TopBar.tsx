'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { api } from '@/lib/client';

export const MODULES = [
  { href: '/crm', name: 'CRM' },
  { href: '/bookings', name: 'Bookings' },
  { href: '/rates', name: 'Rates' },
  { href: '/calendar', name: 'Calendar' },
  { href: '/invoicing', name: 'Invoicing' },
  { href: '/purchasing', name: 'Purchasing' },
  { href: '/expenses', name: 'Expenses' },
  { href: '/accounting', name: 'Accounting' },
  { href: '/b2b', name: 'B2B portal' },
  { href: '/products', name: 'Products' },
  { href: '/reports', name: 'Reports' },
  { href: '/marketing', name: 'Marketing' },
  { href: '/whatsapp', name: 'WhatsApp' },
  { href: '/contacts', name: 'Contacts' },
  { href: '/settings', name: 'Settings' },
];

/** The apps grouped, so the bar stays short: a group opens a small list of its apps. */
export const GROUPS: { name: string; items: string[] }[] = [
  { name: 'Sales', items: ['/crm', '/bookings', '/rates', '/calendar', '/products'] },
  { name: 'Finance', items: ['/invoicing', '/purchasing', '/expenses', '/accounting'] },
  { name: 'Customers', items: ['/contacts', '/b2b', '/marketing', '/whatsapp'] },
  { name: 'Reports', items: ['/reports'] },
  { name: 'Settings', items: ['/settings'] },
];

function Group({ g, cur }: { g: (typeof GROUPS)[number]; cur?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const items = g.items.map((h) => MODULES.find((m) => m.href === h)!).filter(Boolean);
  const active = items.some((m) => m.href === cur);
  if (items.length === 1) return <Link href={items[0].href} className={active ? 'on' : ''} aria-current={active ? 'page' : undefined}>{g.name}</Link>;
  return (
    <div className="mgroup" ref={ref}>
      <button className={active ? 'on' : ''} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>{g.name}{active && cur ? `: ${MODULES.find((m) => m.href === cur)?.name}` : ''} <span aria-hidden="true">▾</span></button>
      {open && <div className="mmenu" role="menu">{items.map((m) => <Link key={m.href} role="menuitem" href={m.href} className={m.href === cur ? 'on' : ''} onClick={() => setOpen(false)}>{m.name}</Link>)}</div>}
    </div>
  );
}

export function TopBar({ company, userName, logo = false }: { company: string; userName: string; logo?: boolean }) {
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo && <img src="/logo" alt="" className="bar-logo" />}
      <span className="brand">{cur ? cur.name : company || 'Travel ERP'}</span>
      {cur ? (
        <nav className="modnav" aria-label="Apps">
          {GROUPS.map((g) => <Group key={g.name} g={g} cur={cur.href} />)}
        </nav>
      ) : <span className="spacer" />}
      <span className="who">{userName}</span>
      <button className="signout" onClick={signOut}>Sign out</button>
    </header>
  );
}
