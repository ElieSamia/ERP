import Link from 'next/link';
import { listContacts } from '@/lib/queries';
import { CONTACT_TYPES, TYPE_BADGE, label } from '@/lib/constants';
import { SearchBox } from '@/components/SearchBox';

type SP = Promise<{ q?: string; type?: string }>;

export default async function ContactsPage({ searchParams }: { searchParams: SP }) {
  const { q, type = 'all' } = await searchParams;
  const rows = await listContacts({ q, type });
  const chip = (k: string, l: string) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (k !== 'all') p.set('type', k);
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
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty">{q || type !== 'all' ? 'No contacts match this search or filter.' : 'No contacts yet. Use New contact to add your first one.'}</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>City</th><th>Email</th><th>Phone</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/contacts/${c.id}`}><strong>{c.name}</strong></Link></td>
                  <td><span className={`badge ${TYPE_BADGE[c.type]}`}>{label(CONTACT_TYPES, c.type)}</span></td>
                  <td>{c.city}</td><td>{c.email}</td><td>{c.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
