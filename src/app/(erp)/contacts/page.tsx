import Link from 'next/link';
import { listContacts } from '@/lib/queries';
import { CONTACT_TYPES, TYPE_BADGE, label } from '@/lib/constants';
import { SearchBox } from '@/components/SearchBox';
import { ContactsTable } from '@/components/ContactsTable';
import { db } from '@/lib/db';

type SP = Promise<{ q?: string; type?: string; tag?: string }>;

export default async function ContactsPage({ searchParams }: { searchParams: SP }) {
  const { q, type = 'all', tag } = await searchParams;
  const d = await db();
  const [rows, tags, auds] = await Promise.all([listContacts({ q, type, tag }), d.collection('contacts').distinct('tags'), d.collection('audiences').find({}, { projection: { name: 1 } }).sort({ name: 1 }).toArray()]);
  const chip = (k: string, l: string) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (k !== 'all') p.set('type', k);
    if (tag) p.set('tag', tag);
    return <Link key={k} className={`chip ${type === k ? 'on' : ''}`} href={`/contacts${p.toString() ? `?${p}` : ''}`}>{l}</Link>;
  };
  return (
    <>
      <div className="cp">
        <div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Contacts</h1></div>
        <div className="cp-actions"><Link className="btn primary" href="/contacts/new">New contact</Link></div>
        <div className="cp-tools">
          <SearchBox placeholder="Search name, email, phone or city" />
          <div className="chips" role="group" aria-label="Filter by type">{chip('all', 'All')}{CONTACT_TYPES.map(([k, l]) => chip(k, l))}</div>
          {(tags as string[]).length > 0 && <div className="chips" role="group" aria-label="Filter by tag">{(tags as string[]).filter(Boolean).sort().map((t) => { const p = new URLSearchParams(); if (q) p.set('q', q); if (type !== 'all') p.set('type', type); if (tag !== t) p.set('tag', t); return <Link key={t} className={`chip ${tag === t ? 'on' : ''}`} href={`/contacts${p.toString() ? `?${p}` : ''}`}>#{t}</Link>; })}</div>}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty">{q || type !== 'all' || tag ? 'No contacts match this search or filter.' : 'No contacts yet. Use New contact to add your first one.'}</div>
      ) : (
        <ContactsTable rows={rows} tags={(tags as string[]).filter(Boolean)} audiences={auds.map((a) => ({ id: String(a._id), name: String(a.name) }))} />
      )}
    </>
  );
}
