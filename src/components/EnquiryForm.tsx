'use client';
import { useState } from 'react';
import { DateInput } from './DateInput';

/** The ERP's own hosted enquiry form, for linking to or embedding on any page. */
export function EnquiryForm({ siteKey, types }: { siteKey: string; types: [string, string][] }) {
  const [started] = useState(Date.now());
  const [dates, setDates] = useState({ from: '', to: '' });
  const [state, setState] = useState<{ busy: boolean; done: string; err: string }>({ busy: false, done: '', err: '' });
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState({ busy: true, done: '', err: '' });
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const r = await fetch('/api/public/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, key: siteKey, started, marketing: data.marketing === 'on', page: document.referrer || location.href }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
      setState({ busy: false, done: j.message, err: '' });
    } catch (x) { setState({ busy: false, done: '', err: (x as Error).message }); }
  }
  if (state.done) return <div className="enq-done" role="status">{state.done}</div>;
  return (
    <form className="enq" onSubmit={submit}>
      <div className="grid">
        <label className="fld" htmlFor="q-name"><span>Your name</span><input id="q-name" name="name" required autoComplete="name" /></label>
        <label className="fld" htmlFor="q-email"><span>Email</span><input id="q-email" name="email" type="email" autoComplete="email" /></label>
        <label className="fld" htmlFor="q-phone"><span>Phone or WhatsApp</span><input id="q-phone" name="phone" type="tel" autoComplete="tel" placeholder="+961 …" /></label>
        <label className="fld" htmlFor="q-type"><span>I’m looking for</span><select id="q-type" name="type" defaultValue="package">{types.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="fld" htmlFor="q-dest"><span>Destination</span><input id="q-dest" name="destination" placeholder="Where would you like to go?" /></label>
        <label className="fld" htmlFor="q-from"><span>From</span><DateInput id="q-from" value={dates.from} onChange={(v) => setDates({ ...dates, from: v })} /><input type="hidden" name="from" value={dates.from} /></label>
        <label className="fld" htmlFor="q-to"><span>To</span><DateInput id="q-to" value={dates.to} min={dates.from} onChange={(v) => setDates({ ...dates, to: v })} /><input type="hidden" name="to" value={dates.to} /></label>
        <label className="fld" htmlFor="q-ad"><span>Adults</span><input id="q-ad" name="adults" type="number" min={1} defaultValue={2} /></label>
        <label className="fld" htmlFor="q-ch"><span>Children</span><input id="q-ch" name="children" type="number" min={0} defaultValue={0} /></label>
        <label className="fld" htmlFor="q-bud"><span>Budget (USD, optional)</span><input id="q-bud" name="budget" type="number" min={0} /></label>
        <label className="fld wide" htmlFor="q-msg"><span>Anything else we should know?</span><textarea id="q-msg" name="message" rows={4} /></label>
      </div>
      {/* Hidden from people; automated spam fills it in. */}
      <label className="enq-hp" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      <label className="tgl" style={{ marginTop: 8 }}><input type="checkbox" name="marketing" /> Send me travel offers by email</label>
      {state.err && <p className="form-error" role="alert">{state.err}</p>}
      <button className="btn primary" style={{ marginTop: 12 }} disabled={state.busy}>{state.busy ? 'Sending…' : 'Send my request'}</button>
    </form>
  );
}
