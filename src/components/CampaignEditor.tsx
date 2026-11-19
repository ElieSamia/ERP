'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { fmtDateTime } from '@/lib/constants';
import type { Audience, Campaign } from '@/lib/marketing';
import { Modal } from './Modal';
import { DateInput } from './DateInput';
import { useToast } from './Toast';

type Draft = Pick<Campaign, 'name' | 'subject' | 'preheader' | 'heading' | 'body' | 'imageUrl' | 'buttonText' | 'buttonUrl' | 'audienceId'>;
const pick = (c: Campaign): Draft => ({ name: c.name, subject: c.subject, preheader: c.preheader, heading: c.heading, body: c.body, imageUrl: c.imageUrl, buttonText: c.buttonText, buttonUrl: c.buttonUrl, audienceId: c.audienceId });
const EMPTY: Draft = { name: '', subject: '', preheader: '', heading: '', body: '', imageUrl: '', buttonText: '', buttonUrl: '', audienceId: '' };
type Counts = { total: number; reachable: number; noEmail: number; unsubscribed: number };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '0%');

export function CampaignEditor({ initial, audiences, provider, meEmail }: { initial?: Campaign; audiences: Audience[]; provider: string; meEmail: string }) {
  const router = useRouter();
  const toast = useToast();
  const [c, setC] = useState(initial);
  const [f, setF] = useState(initial ? pick(initial) : { ...EMPTY, audienceId: audiences[0]?.id ?? '' });
  const [saved, setSaved] = useState(initial ? pick(initial) : null);
  const [html, setHtml] = useState('');
  const [counts, setCounts] = useState<Counts | null>(null);
  const [testTo, setTestTo] = useState(meEmail);
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState<null | { schedule: boolean; at: string }>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editable = !c || c.status === 'draft';
  const dirty = !saved || JSON.stringify(f) !== JSON.stringify(saved);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF({ ...f, [k]: v });

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { api<{ html: string }>('/api/marketing/preview', 'POST', f).then((r) => setHtml(r.html)).catch(() => null); }, 350);
    return () => clearTimeout(timer.current);
  }, [f]);
  useEffect(() => {
    const a = audiences.find((x) => x.id === f.audienceId);
    if (!a || !editable) { setCounts(null); return; }
    api<Counts>('/api/marketing/audiences/preview', 'POST', { filter: a.filter }).then(setCounts).catch(() => setCounts(null));
  }, [f.audienceId, audiences, editable]);

  async function save(quiet = false) {
    setBusy('save');
    try {
      if (c) { const r = await api<Campaign>(`/api/marketing/campaigns/${c.id}`, 'PATCH', f); setC(r); setSaved(pick(r)); if (!quiet) toast('Campaign saved.'); return r; }
      const r = await api<{ id: string }>('/api/marketing/campaigns', 'POST', f);
      toast('Draft saved.'); router.push(`/marketing/campaigns/${r.id}`); router.refresh(); return null;
    } catch (e) { toast((e as Error).message, 'err'); return null; } finally { setBusy(''); }
  }
  async function test() {
    if (!c) return toast('Save the draft first.', 'err');
    if (dirty && !(await save(true))) return;
    setBusy('test');
    try { await api(`/api/marketing/campaigns/${c.id}/test`, 'POST', { to: testTo }); toast(`Test sent to ${testTo}.`); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(''); }
  }
  async function send() {
    if (!c || !confirm) return;
    if (dirty && !(await save(true))) return;
    setBusy('send');
    try {
      const body = confirm.schedule ? { scheduleAt: new Date(confirm.at).toISOString() } : {};
      const r = await api<Campaign>(`/api/marketing/campaigns/${c.id}/send`, 'POST', body);
      setC(r); setConfirm(null); toast(confirm.schedule ? 'Campaign scheduled.' : `Campaign sent to ${r.recipients} contacts.`); router.refresh();
    } catch (e) { toast((e as Error).message, 'err'); setConfirm(null); router.refresh(); } finally { setBusy(''); }
  }
  async function refresh() {
    if (!c) return;
    setBusy('refresh');
    try { setC(await api<Campaign>(`/api/marketing/campaigns/${c.id}/refresh`, 'POST')); toast('Results updated.'); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(''); }
  }
  async function duplicate() {
    try { const r = await api<{ id: string }>('/api/marketing/campaigns', 'POST', { ...f, name: `${f.name} (copy)` }); router.push(`/marketing/campaigns/${r.id}`); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  async function remove() {
    if (!c || !window.confirm('Delete this draft?')) return;
    try { await api(`/api/marketing/campaigns/${c.id}`, 'DELETE'); router.push('/marketing'); router.refresh(); } catch (e) { toast((e as Error).message, 'err'); }
  }

  const st = c?.stats;
  const fld = (id: string, label: string, k: keyof Draft, ph = '', wide = false) => (
    <label className={`fld ${wide ? 'wide' : ''}`} htmlFor={id}><span>{label}</span><input id={id} value={f[k]} placeholder={ph} disabled={!editable} onChange={(e) => set(k, e.target.value)} /></label>
  );
  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href="/marketing">Marketing</Link><span className="sep">/</span><span>{c ? c.name : 'New campaign'}</span></div>
        <div className="cp-actions">
          {editable && dirty && <span className="dirty">Unsaved changes</span>}
          {editable && <button className="btn" onClick={() => save()} disabled={busy !== '' || !dirty}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>}
          {c && editable && <button className="btn primary" onClick={() => setConfirm({ schedule: false, at: '' })} disabled={busy !== ''}>Send…</button>}
          {c && !editable && <button className="btn" onClick={duplicate}>Duplicate</button>}
          {c && editable && <button className="btn ghost" onClick={remove}>Delete</button>}
        </div>
        {c && <div className="cp-tools"><span className={`badge ${c.status === 'sent' ? 'b-green' : c.status === 'scheduled' ? 'b-accent' : ''}`}>{c.status === 'sent' ? 'Sent' : c.status === 'scheduled' ? 'Scheduled' : c.status === 'draft' ? 'Draft' : c.status}</span></div>}
      </div>
      {c?.error && editable && <p className="form-error">Last attempt failed: {c.error}</p>}
      {c && !editable && (
        <section className="sheet" style={{ marginBottom: 16 }}>
          <div className="cp" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Results</h2><div className="cp-actions"><button className="btn" onClick={refresh} disabled={busy !== ''}>{busy === 'refresh' ? 'Updating…' : 'Refresh results'}</button></div></div>
          <p className="muted" style={{ marginTop: 0 }}>{c.status === 'scheduled' ? `Scheduled for ${fmtDateTime(c.scheduledAt)}` : `Sent ${fmtDateTime(c.sentAt)}`} through {c.provider === 'mailchimp' ? 'Mailchimp' : 'Brevo'} to {c.recipients} contact{c.recipients === 1 ? '' : 's'}.{c.statsAt ? ` Results as of ${fmtDateTime(c.statsAt)}.` : ''}</p>
          {st ? (
            <div className="kpis">
              <div className="kpi"><span>Delivered</span><b>{st.delivered}</b><span className="muted">of {st.sent} sent</span></div>
              <div className="kpi"><span>Opened</span><b>{pct(st.opens, st.delivered)}</b><span className="muted">{st.opens} people</span></div>
              <div className="kpi"><span>Clicked</span><b>{pct(st.clicks, st.delivered)}</b><span className="muted">{st.clicks} people</span></div>
              <div className="kpi"><span>Unsubscribed</span><b>{st.unsubscribes}</b><span className="muted">{st.bounces} bounced</span></div>
            </div>
          ) : <p className="muted" style={{ margin: 0 }}>Select Refresh results to read the numbers from {c.provider === 'mailchimp' ? 'Mailchimp' : 'Brevo'}. Opens and clicks keep coming in for a few days.</p>}
          <p className="hint">People who unsubscribe or whose address bounces are switched to “Unsubscribed” on their contact, so they’re never emailed again.</p>
        </section>
      )}
      <div className="cmp">
        <section className="sheet">
          <div className="grid">
            {fld('c-name', 'Campaign name (internal)', 'name', 'Summer offers 2027', true)}
            <label className="fld wide" htmlFor="c-aud"><span>Send to</span>
              <select id="c-aud" value={f.audienceId} disabled={!editable} onChange={(e) => set('audienceId', e.target.value)}>
                <option value="">Choose an audience…</option>{audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></label>
          </div>
          {editable && counts && <p className="hint" style={{ marginTop: 6 }}><b>{counts.reachable}</b> will receive it{counts.unsubscribed || counts.noEmail ? `; ${counts.unsubscribed} unsubscribed and ${counts.noEmail} without an email address are left out` : ''}. <Link href="/marketing?tab=audiences">Manage audiences</Link></p>}
          {editable && audiences.length === 0 && <p className="hint">No audiences yet. <Link href="/marketing/audiences/new">Create one</Link> first.</p>}
          <div className="grid" style={{ marginTop: 10 }}>
            {fld('c-subj', 'Subject line', 'subject', 'Early-bird summer packages, up to 15% off', true)}
            {fld('c-pre', 'Preview text (shown after the subject in the inbox)', 'preheader', 'Book by 31 January', true)}
            {fld('c-head', 'Heading', 'heading', 'Your summer, sorted', true)}
            {fld('c-img', 'Image address (optional, https)', 'imageUrl', 'https://thetravelconsult.com/wp-content/uploads/…', true)}
            <label className="fld wide" htmlFor="c-body"><span>Message (leave an empty line between paragraphs)</span><textarea id="c-body" rows={9} value={f.body} disabled={!editable} onChange={(e) => set('body', e.target.value)} /></label>
            {fld('c-bt', 'Button text (optional)', 'buttonText', 'See the offers')}
            {fld('c-bu', 'Button link', 'buttonUrl', 'https://thetravelconsult.com/offers')}
          </div>
          {editable && c && (
            <div className="addrow">
              <label className="sr" htmlFor="c-test">Send a test to</label>
              <input id="c-test" className="sel" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              <button className="btn" onClick={test} disabled={busy !== ''}>{busy === 'test' ? 'Sending…' : 'Send a test to me'}</button>
            </div>
          )}
          {editable && <p className="hint">Tests go through your own mailbox. The real campaign goes through {provider === 'mailchimp' ? 'Mailchimp' : provider === 'brevo' ? 'Brevo' : 'the service you connect'}, which adds the unsubscribe link at the bottom.</p>}
        </section>
        <section className="sheet cmp-prev">
          <h2>Preview</h2>
          <p className="muted" style={{ marginTop: 0 }}><b>{f.subject || 'Subject line'}</b> · {f.preheader}</p>
          <iframe title="Campaign preview" srcDoc={html} sandbox="" className="mailprev" />
        </section>
      </div>
      {confirm && c && (
        <Modal title={confirm.schedule ? 'Schedule the campaign' : 'Send the campaign'} onClose={() => setConfirm(null)}>
          <p style={{ marginTop: 0 }}>“{f.subject}” to <b>{counts?.reachable ?? '…'}</b> contacts in {audiences.find((a) => a.id === f.audienceId)?.name ?? 'the audience'}, through {provider === 'mailchimp' ? 'Mailchimp' : 'Brevo'}.</p>
          <div className="chips" style={{ marginBottom: 10 }}>
            <button className={`chip ${!confirm.schedule ? 'on' : ''}`} onClick={() => setConfirm({ ...confirm, schedule: false })}>Send now</button>
            <button className={`chip ${confirm.schedule ? 'on' : ''}`} onClick={() => setConfirm({ ...confirm, schedule: true })}>Schedule</button>
          </div>
          {confirm.schedule && <div className="grid">
            <label className="fld" htmlFor="c-at"><span>Date</span><DateInput id="c-at" value={confirm.at.slice(0, 10)} onChange={(v) => setConfirm({ ...confirm, at: v ? `${v}T${confirm.at.slice(11, 16) || '09:00'}` : '' })} /></label>
            <label className="fld" htmlFor="c-tm"><span>Time{provider === 'mailchimp' ? ' (on the quarter hour)' : ''}</span><input id="c-tm" type="time" step={900} value={confirm.at.slice(11, 16)} onChange={(e) => setConfirm({ ...confirm, at: `${confirm.at.slice(0, 10)}T${e.target.value}` })} /></label>
          </div>}
          <p className="hint">Once sent, a campaign can’t be changed or recalled. Send yourself a test first if you haven’t.</p>
          <div className="dlg-actions">
            <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn primary" onClick={send} disabled={busy !== '' || (confirm.schedule && !confirm.at)}>{busy === 'send' ? 'Sending…' : confirm.schedule ? 'Schedule' : `Send to ${counts?.reachable ?? ''} contacts`}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
