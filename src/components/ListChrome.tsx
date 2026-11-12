import Link from 'next/link';

/** Filter chips that keep the current search in the address. */
export function FilterChips({ base, current, q, items, param = 'status', extra = {} }: {
  base: string; current: string; q?: string; items: readonly (readonly [string, string])[]; param?: string; extra?: Record<string, string>;
}) {
  return (
    <div className="chips" role="group" aria-label="Filter">
      {[['all', 'All'] as const, ...items].map(([k, l]) => {
        const p = new URLSearchParams(extra);
        if (q) p.set('q', q);
        if (k !== 'all') p.set(param, k);
        return <Link key={k} className={`chip ${current === k ? 'on' : ''}`} href={`${base}${p.toString() ? `?${p}` : ''}`}>{l}</Link>;
      })}
    </div>
  );
}

export function Tabs({ base, current, items }: { base: string; current: string; items: [string, string][] }) {
  return (
    <nav className="tabs" aria-label="Sections">
      {items.map(([k, l]) => <Link key={k} className={`tab ${current === k ? 'on' : ''}`} href={`${base}?tab=${k}`} aria-current={current === k ? 'page' : undefined}>{l}</Link>)}
    </nav>
  );
}
