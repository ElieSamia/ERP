import Link from 'next/link';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { EMPTY_FILTER, getMarketingSettings, reachable, resolveAudience, toAudience, toCampaign } from '@/lib/marketing';
import { fmtDateTime } from '@/lib/constants';
import { Tabs } from '@/components/ListChrome';
import { MarketingConnection } from '@/components/MarketingConnection';

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '');

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = (await getSession())!;
  const tab = (await searchParams).tab ?? 'campaigns';
  const d = await db();
  const [settings, camps, auds] = await Promise.all([getMarketingSettings(), d.collection('campaigns').find({}).sort({ createdAt: -1 }).limit(200).toArray(), d.collection('audiences').find({}).sort({ name: 1 }).toArray()]);
  const campaigns = camps.map((c) => ({ ...toCampaign(c), audienceName: String(c.audienceName || '') }));
  const audiences = auds.map(toAudience);
  const counts = tab === 'audiences' ? await Promise.all(audiences.map(async (a) => { const m = await resolveAudience({ ...EMPTY_FILTER, ...a.filter }); return { all: m.length, ok: reachable(m).length }; })) : [];
  const tabs: [string, string][] = [['campaigns', 'Campaigns'], ['audiences', 'Audiences'], ...(user.role === 'admin' ? [['connection', 'Connection'] as [string, string]] : [])];
  return (
    <>
      <div className="cp">
        <div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Marketing</h1></div>
        <div className="cp-actions">
          {tab === 'audiences' ? <Link className="btn primary" href="/marketing/audiences/new">New audience</Link> : <Link className="btn primary" href="/marketing/campaigns/new">New campaign</Link>}
        </div>
        <Tabs base="/marketing" current={tab} items={tabs} />
      </div>
      {!settings.provider && tab !== 'connection' && <p className="banner">Campaigns need Mailchimp or Brevo. {user.role === 'admin' ? <Link href="/marketing?tab=connection">Connect one</Link> : 'Ask an administrator to connect one'}; you can prepare audiences and drafts meanwhile.</p>}
      {tab === 'campaigns' && (campaigns.length === 0 ? <div className="empty">No campaigns yet. Create an audience, then a campaign: an offer, a newsletter or a seasonal announcement.</div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Campaign</th><th>Audience</th><th>Status</th><th>Sent</th><th className="num">Recipients</th><th className="num">Opened</th><th className="num">Clicked</th></tr></thead>
          <tbody>{campaigns.map((c) => (
            <tr key={c.id}><td><Link href={`/marketing/campaigns/${c.id}`}><strong>{c.name}</strong></Link><span className="muted" style={{ display: 'block', fontSize: 13 }}>{c.subject}</span></td>
              <td>{c.audienceName || audiences.find((a) => a.id === c.audienceId)?.name || ''}</td>
              <td><span className={`badge ${c.status === 'sent' ? 'b-green' : c.status === 'scheduled' ? 'b-accent' : ''}`}>{c.status === 'sent' ? 'Sent' : c.status === 'scheduled' ? 'Scheduled' : 'Draft'}</span>{c.error && c.status === 'draft' && <span className="badge b-red" style={{ marginLeft: 4 }}>Failed</span>}</td>
              <td>{c.status === 'scheduled' ? fmtDateTime(c.scheduledAt) : c.sentAt ? fmtDateTime(c.sentAt) : ''}</td>
              <td className="num">{c.recipients || ''}</td><td className="num">{c.stats ? pct(c.stats.opens, c.stats.delivered) : ''}</td><td className="num">{c.stats ? pct(c.stats.clicks, c.stats.delivered) : ''}</td></tr>))}
          </tbody></table></div>
      ))}
      {tab === 'audiences' && (audiences.length === 0 ? <div className="empty">No audiences yet. An audience is a saved filter, such as “Agencies in Lebanon” or “Customers who went to Dubai”.</div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Audience</th><th>Description</th><th className="num">Contacts</th><th className="num">Can receive campaigns</th></tr></thead>
          <tbody>{audiences.map((a, i) => <tr key={a.id}><td><Link href={`/marketing/audiences/${a.id}`}><strong>{a.name}</strong></Link></td><td className="muted">{a.desc}</td><td className="num">{counts[i]?.all}</td><td className="num">{counts[i]?.ok}</td></tr>)}</tbody>
        </table></div>
      ))}
      {tab === 'connection' && user.role === 'admin' && <MarketingConnection initial={settings} />}
    </>
  );
}
