import Link from 'next/link';
import { listLeads } from '@/lib/queries';
import { LEAD_STAGES, STAGE_BADGE, fmtDate, label, money } from '@/lib/constants';
import { SearchBox } from '@/components/SearchBox';
import { Kanban } from '@/components/Kanban';
import { CrmFilters } from '@/components/CrmFilters';
import { db } from '@/lib/db';

type SP = Promise<{ q?: string; view?: string; source?: string; created?: string; travel?: string; ctype?: string; dest?: string; attention?: string; booking?: string; followup?: string }>;

export default async function CrmPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { q, view = 'kanban', ...filters } = sp;
  const [leads, sources] = await Promise.all([listLeads(q, filters), (await db()).collection('leads').distinct('source')]);
  const href = (v: string) => { const p = new URLSearchParams(Object.entries({ ...sp, view: v }).filter(([, x]) => x) as [string, string][]); return `/crm?${p}`; };
  const filtered = !!q || Object.values(filters).some(Boolean);
  return (
    <>
      <div className="cp">
        <div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>CRM pipeline</h1></div>
        <div className="cp-actions"><Link className="btn primary" href="/crm/new">New opportunity</Link></div>
        <div className="cp-tools">
          <SearchBox placeholder="Search opportunity, customer, email, phone or enquiry ID" />
          <div className="chips">
            <Link className={`chip ${view !== 'list' ? 'on' : ''}`} href={href('kanban')}>Pipeline</Link>
            <Link className={`chip ${view === 'list' ? 'on' : ''}`} href={href('list')}>List</Link>
          </div>
          {view !== 'list' && <span className="muted" style={{ fontSize: 13.5 }}>Drag cards between stages.</span>}
        </div>
        <CrmFilters sources={(sources as string[]).filter(Boolean).sort()} />
      </div>
      {view === 'list' ? (
        leads.length === 0 ? <div className="empty">{filtered ? 'No opportunities match this search or these filters.' : 'No opportunities yet. Use New opportunity to add one.'}</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Opportunity</th><th>Source</th><th>Customer</th><th>Destination</th><th>Travel date</th><th>Stage</th><th className="num">Budget</th></tr></thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td><Link href={`/crm/${l.id}`}><strong>{l.title}</strong></Link>{l.ref && <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>{l.ref}</span>}</td><td>{l.source ? <span className="badge">{l.source}</span> : l.requestId ? <span className="badge">B2B portal</span> : ''}</td><td>{l.contactName}</td><td>{l.destination}</td><td>{fmtDate(l.travelDate)}</td>
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
