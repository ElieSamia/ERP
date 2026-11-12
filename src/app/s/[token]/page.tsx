import type { Metadata } from 'next';
import { findShare, markViewed } from '@/lib/shares';
import { loadDoc } from '@/lib/printdocs';
import { getCompany } from '@/lib/queries';
import { fmtDate } from '@/lib/constants';
import { PrintButton } from '@/components/PrintBar';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Document', robots: { index: false, follow: false } };

/** Public view of one shared document. No sign-in; the token is the only key and it expires. */
export default async function SharedDoc({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [share, company] = await Promise.all([findShare(token), getCompany()]);
  const doc = share ? await loadDoc(share.kind, share.id, share.pid ?? undefined, { prices: share.prices }) : null;
  if (!share || !doc) {
    return (
      <div className="auth"><div className="auth-card">
        <h1>This link isn’t available</h1>
        <p>It may have expired or been cancelled. Please ask {company.name || 'us'} for a new link.</p>
      </div></div>
    );
  }
  await markViewed(token);
  return (
    <div className="printpage">
      <div className="doc-toolbar noprint">
        <PrintButton />
        <span className="muted">Shared by {company.name}. This link works until {fmtDate(share.expiresAt.toISOString().slice(0, 10))}.</span>
      </div>
      {doc.node}
    </div>
  );
}
