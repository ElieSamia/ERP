import { getSession } from '@/lib/auth';
import { accessFor } from '@/lib/roles';
import Link from 'next/link';
import { listProducts } from '@/lib/products';
import { getPricing } from '@/lib/bookings';
import { SERVICE_TYPES, fmtMarkup, label, money, productMarkup, sell, type Channel } from '@/lib/constants';
import { SearchBox } from '@/components/SearchBox';

type SP = Promise<{ q?: string; type?: string; active?: string }>;

export default async function ProductsPage({ searchParams }: { searchParams: SP }) {
  const { q, type = 'all', active = 'yes' } = await searchParams;
  const [list, pricing] = await Promise.all([listProducts({ q, type, active: active as 'yes' | 'no' | 'all' }), getPricing()]);
  const me = await getSession();
  const costs = me ? (await accessFor(me.sub, me.role)).costs : false;
  const link = (o: Record<string, string>) => `/products?${new URLSearchParams({ ...(q ? { q } : {}), type, active, ...o })}`;
  const chans: Channel[] = ['B2C', 'B2B', 'Corporate'];
  return (
    <>
      <div className="cp">
        <div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Products and pricing</h1></div>
        <div className="cp-actions"><Link className="btn" href="/settings">Channel markups</Link><Link className="btn primary" href="/products/new">New product</Link></div>
        <div className="cp-tools">
          <SearchBox placeholder="Search name, code or description" />
          <div className="chips">{[['all', 'All'] as [string, string], ...SERVICE_TYPES.map(([k, l]) => [k, l] as [string, string])].map(([k, l]) => <Link key={k} className={`chip ${type === k ? 'on' : ''}`} href={link({ type: k })}>{l}</Link>)}</div>
          <div className="chips">{[['yes', 'Active'], ['no', 'Archived'], ['all', 'All']].map(([k, l]) => <Link key={k} className={`chip ${active === k ? 'on' : ''}`} href={link({ active: k })}>{l}</Link>)}</div>
        </div>
      </div>
      {list.length === 0 ? <div className="empty">{q || type !== 'all' ? 'No products match.' : 'No products yet. Add the hotels, transfers, visas and packages you sell often, with their cost and markup, then add them to bookings in one click.'}</div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Product</th><th>Type</th><th>Supplier</th>{costs && <><th className="num">Cost</th><th>Markup</th></>}{chans.map((c) => <th key={c} className="num">{c}</th>)}<th className="num">Used</th></tr></thead>
          <tbody>{list.map((p) => (
            <tr key={p.id}><td><Link href={`/products/${p.id}`}><strong>{p.name}</strong></Link>{p.code && <span className="muted"> {p.code}</span>}{!p.active && <span className="badge" style={{ marginLeft: 6 }}>Archived</span>}</td>
              <td>{label(SERVICE_TYPES, p.type)}</td><td>{p.supplierName ?? ''}</td>{costs && <><td className="num">{money(p.cost)}</td>
              <td>{p.pricing === 'channel' ? <span className="muted">Channel default</span> : fmtMarkup(p.markup, p.pricing)}</td></>}
              {chans.map((c) => <td key={c} className="num">{money(sell({ cost: p.cost, ...productMarkup(p, c, pricing) }))}</td>)}
              <td className="num">{p.used || ''}</td></tr>))}
          </tbody></table></div>
      )}
      <p className="hint">Selling prices are before VAT. Channel defaults come from Settings: B2C {fmtMarkup(pricing.B2C, pricing.modes.B2C)}, B2B {fmtMarkup(pricing.B2B, pricing.modes.B2B)}, Corporate {fmtMarkup(pricing.Corporate, pricing.modes.Corporate)}.</p>
    </>
  );
}
