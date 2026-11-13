import { redirect } from 'next/navigation';
import { getPortalCtx, getRoles, listPortalUsers } from '@/lib/portal';
import { PortalUsersPanel } from '@/components/PortalAdmin';

export default async function PortalTeam() {
  const ctx = await getPortalCtx();
  if (!ctx) redirect('/portal/login');
  if (ctx.perms.manageUsers !== 'yes') return <div className="empty">Only your account admin can manage people.</div>;
  const [users, roles] = await Promise.all([listPortalUsers(ctx.contactId), getRoles()]);
  return (
    <>
      <div className="cp"><div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Team</h1></div></div>
      <PortalUsersPanel contactId={ctx.contactId} contactName={ctx.contactName} initial={users} roles={roles} endpoint="/api/portal/team" selfId={ctx.userId} />
      <section className="sheet" style={{ marginTop: 16 }}>
        <h2>What each role can do</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Role</th><th>Description</th></tr></thead>
          <tbody>{roles.map((r) => <tr key={r.id}><td><strong>{r.name}</strong></td><td>{r.desc}</td></tr>)}</tbody>
        </table></div>
      </section>
    </>
  );
}
