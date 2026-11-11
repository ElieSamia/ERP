import Link from 'next/link';
import { listLeads } from '@/lib/queries';
import { LEAD_STAGES, STAGE_BADGE, fmtDate, label, money } from '@/lib/constants';
import { SearchBox } from '@/components/SearchBox';
import { Kanban } from '@/components/Kanban';

type SP = Promise<{ q?: string; view?: string }>;

export default async function CrmPage({ searchParams }: { searchParams: SP }) {
  const { q, view = 'kanban' } = await searchParams;
  const leads = await listLeads(q);
  const href = (v: string) => `/crm?view=${v}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  return (
    <>
      <div className="cp">
        <div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>CRM pipeline</h1></div>
        <div className="cp-actions"><Link className="btn primary" href="/crm/new">New opportunity</Link></div>
        <div className="cp-tools">
          <SearchBox placeholder="Search opportunities" />
          <div className="chips">
            <Link className={`chip ${view !== 'list' ? 'on' : ''}`} href={href('kanban')}>Pipeline</Link>
            <Link className={`chip ${view === 'list' ? 'on' : ''}`} href={href('list')}>List</Link>
          </div>
          {view !== 'list' && <span className="muted" style={{ fontSize: 13.5 }}>Drag cards between stages.</span>}
        </div>
      </div>
      {view === 'list' ? (
        leads.length === 0 ? <div className="empty">{q ? 'No opportunities match this search.' : 'No opportunities yet. Use New opportunity to add one.'}</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Opportunity</th><th>Customer</th><th>Destination</th><th>Travel date</th><th>Stage</th><th className="num">Budget</th></tr></thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td><Link href={`/crm/${l.id}`}><strong>{l.title}</strong></Link></td><td>{l.contactName}</td><td>{l.destination}</td><td>{fmtDate(l.travelDate)}</td>
                    <td><span className={`badge ${STAGE_BADGE[l.stage]}`}>{label(LEAD_STAGES, l.stage)}</span></td><td className="num">{money(l.budget)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : <Kanban leads={leads} />}
    </>
  );
}
