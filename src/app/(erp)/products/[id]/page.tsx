import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { accessFor } from '@/lib/roles';
import { SERVICE_TYPES, label, money, productMarkup, sell } from '@/lib/constants';
import { notFound } from 'next/navigation';
import { getPricing, listSuppliers } from '@/lib/bookings';
import { getFinance } from '@/lib/finance';
import { getProduct } from '@/lib/products';
import { ProductForm } from '@/components/ProductForm';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const [p, suppliers, pricing, fin] = await Promise.all([getProduct((await params).id), listSuppliers(), getPricing(), getFinance()]);
  if (!p) notFound();
  const me = await getSession();
  if (me && !(await accessFor(me.sub, me.role)).costs) {
    // Without access to costs: the product and its selling prices only.
    return (
      <>
        <div className="cp"><div className="crumbs"><Link className="crumb" href="/products">Products</Link><span className="sep">/</span><span>{p.name}</span></div></div>
        <section className="sheet">
          <table className="kv"><tbody>
            <tr><th>Product</th><td>{p.name}{p.code ? ` (${p.code})` : ''}</td></tr>
            <tr><th>Type</th><td>{label(SERVICE_TYPES, p.type)}</td></tr>
            {p.desc && <tr><th>Description</th><td>{p.desc}</td></tr>}
            {(['B2C', 'B2B', 'Corporate'] as const).map((ch) => <tr key={ch}><th>Price, {ch}</th><td><b>{money(sell({ cost: p.cost, ...productMarkup(p, ch, pricing) }))}</b></td></tr>)}
          </tbody></table>
          <p className="hint">Costs and markups are visible to roles with access to costs.</p>
        </section>
      </>
    );
  }
  return <ProductForm key={p.id} initial={p} suppliers={suppliers} pricing={pricing} vatDefaults={fin.vat} />;
}
