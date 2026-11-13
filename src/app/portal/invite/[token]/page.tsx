import { db } from '@/lib/db';
import { hashToken } from '@/lib/portal';
import { getCompany } from '@/lib/queries';
import { InviteForm } from '@/components/PortalAuthForms';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [c, u] = await Promise.all([getCompany(), /^[A-Za-z0-9_-]{20,80}$/.test(token) ? (await db()).collection('portalUsers').findOne({ inviteHash: hashToken(token) }) : null]);
  if (!u || !u.active || !(u.inviteExpires instanceof Date) || u.inviteExpires < new Date()) {
    return <div className="auth"><div className="auth-card"><h1>This link isn’t valid</h1><p>It may have expired or already been used. Ask your account admin or {c.name || 'us'} for a new one.</p><a className="btn primary" href="/portal/login">Go to sign-in</a></div></div>;
  }
  return <InviteForm token={token} name={String(u.name)} company={c.name || 'our'} />;
}
