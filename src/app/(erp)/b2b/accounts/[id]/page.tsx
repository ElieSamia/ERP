import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContact } from '@/lib/queries';
import { getRoles, listPortalUsers } from '@/lib/portal';
import { PortalUsersPanel } from '@/components/PortalAdmin';

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const c = await getContact(id);
  if (!c) notFound();
  const [users, roles] = await Promise.all([listPortalUsers(id), getRoles()]);
  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href="/b2b?tab=accounts">B2B portal</Link><span className="sep">/</span><span>{c.name}</span></div>
        <div className="cp-actions"><Link className="btn" href={`/contacts/${c.id}`}>Open contact</Link></div>
      </div>
      {c.portalAccess !== 'yes' && <p className="banner">Portal access is off for this account, so its users can’t sign in. Turn on Portal access on the contact.</p>}
      <PortalUsersPanel contactId={c.id} contactName={c.name} initial={users} roles={roles.filter((r) => r.side === (c.type === 'supplier' ? 'supplier' : 'customer'))} />
    </>
  );
}
