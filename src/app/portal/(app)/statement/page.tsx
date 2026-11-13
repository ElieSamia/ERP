import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPortalCtx } from '@/lib/portal';
import { loadDoc } from '@/lib/printdocs';

export default async function PortalStatement() {
  const ctx = await getPortalCtx();
  if (!ctx) redirect('/portal/login');
  if (ctx.perms.statement !== 'yes') return <div className="empty">Your access doesn’t include the statement of account. Ask your account admin.</div>;
  const kind = ctx.side === 'supplier' ? 'supstatement' : 'statement';
  const doc = await loadDoc(kind, ctx.contactId);
  return (
    <>
      <div className="cp"><div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>{ctx.side === 'supplier' ? 'Statement' : 'Statement of account'}</h1></div>
        <div className="cp-actions"><Link className="btn primary" href={`/portal/print/${kind}/${ctx.contactId}`} target="_blank">Print or save as PDF</Link></div></div>
      <div className="printpage inline">{doc?.node}</div>
    </>
  );
}
