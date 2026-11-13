'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function PortalBar({ company, account, user, links }: { company: string; account: string; user: string; links: [string, string][] }) {
  const path = usePathname();
  async function signOut() {
    await fetch('/api/portal/auth/logout', { method: 'POST' }).catch(() => null);
    window.location.href = '/portal/login';
  }
  return (
    <header className="topbar">
      <span className="brand">{company}</span>
      <nav className="modnav" aria-label="Portal">
        {links.map(([href, l]) => { const on = href === '/portal' ? path === '/portal' : path.startsWith(href); return <Link key={href} href={href} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>{l}</Link>; })}
      </nav>
      <span className="who">{user}, {account}</span>
      <button className="signout" onClick={signOut}>Sign out</button>
    </header>
  );
}
