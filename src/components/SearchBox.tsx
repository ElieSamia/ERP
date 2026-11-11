'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Keeps the search in the address bar so lists can be shared and survive a reload. */
export function SearchBox({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(params.toString());
      if (q.trim()) p.set('q', q.trim()); else p.delete('q');
      const next = `${path}${p.toString() ? `?${p}` : ''}`;
      if (next !== `${path}${params.toString() ? `?${params}` : ''}`) router.replace(next);
    }, 300);
    return () => clearTimeout(t);
  }, [q, params, path, router]);
  return <input type="search" placeholder={placeholder} aria-label={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />;
}
