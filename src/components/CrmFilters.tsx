'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

const SEL: [string, string, [string, string][]][] = [
  ['created', 'Created', [['today', 'Today'], ['week', 'This week'], ['month', 'This month']]],
  ['travel', 'Travel date', [['30d', 'Next 30 days'], ['month', 'This month'], ['next', 'Next month'], ['none', 'Not set yet']]],
  ['ctype', 'Customer type', [['customer', 'Individual'], ['agency', 'Agency'], ['corporate', 'Corporate']]],
  ['booking', 'Booking', [['yes', 'Has a booking'], ['no', 'No booking yet']]],
];

/** Quick chips and a Filters panel; everything lives in the address, so the view can be bookmarked or shared. */
export function CrmFilters({ sources }: { sources: string[] }) {
  const sp = useSearchParams();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dest, setDest] = useState(sp.get('dest') ?? '');
  const url = (ch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(ch)) { if (v) p.set(k, v); else p.delete(k); }
    return `${path}${p.toString() ? `?${p}` : ''}`;
  };
  const on = (k: string, v: string) => sp.get(k) === v;
  const chip = (label: string, ch: Record<string, string>) => {
    const active = Object.entries(ch).every(([k, v]) => sp.get(k) === v);
    return <Link className={`chip ${active ? 'on' : ''}`} href={url(Object.fromEntries(Object.keys(ch).map((k) => [k, active ? null : ch[k]])))}>{label}</Link>;
  };
  const keys = ['source', 'created', 'travel', 'ctype', 'dest', 'attention', 'booking'];
  const count = keys.filter((k) => sp.get(k)).length;
  return (
    <div className="crmf">
      <div className="chips" role="group" aria-label="Quick filters">
        {chip('Website', { source: 'website' })}{chip('WhatsApp', { source: 'whatsapp' })}{chip('New this week', { created: 'week' })}{chip('Needs attention', { attention: '1' })}
        <button className={`chip ${open || count ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>Filters{count ? ` (${count})` : ''}</button>
        {count > 0 && <Link className="linkbtn" href={url(Object.fromEntries(keys.map((k) => [k, null])))}>Clear filters</Link>}
      </div>
      {open && (
        <div className="crmf-panel">
          <label className="fld" htmlFor="cf-source"><span>Source</span>
            <select id="cf-source" value={sp.get('source') ?? ''} onChange={(e) => router.push(url({ source: e.target.value || null }))}>
              <option value="">Any</option><option value="website">Website</option><option value="whatsapp">WhatsApp</option><option value="portal">B2B portal</option><option value="manual">Typed in by staff</option>
              {sources.filter((x) => !['Website', 'WhatsApp'].includes(x)).map((x) => <option key={x} value={x}>{x}</option>)}
            </select></label>
          {SEL.map(([k, l, opts]) => (
            <label key={k} className="fld" htmlFor={`cf-${k}`}><span>{l}</span>
              <select id={`cf-${k}`} value={sp.get(k) ?? ''} onChange={(e) => router.push(url({ [k]: e.target.value || null }))}>
                <option value="">Any</option>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select></label>))}
          <label className="fld" htmlFor="cf-dest"><span>Destination contains</span>
            <input id="cf-dest" value={dest} onChange={(e) => setDest(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') router.push(url({ dest: dest.trim() || null })); }} onBlur={() => { if ((sp.get('dest') ?? '') !== dest.trim()) router.push(url({ dest: dest.trim() || null })); }} placeholder="Paris" /></label>
          <label className="tgl" style={{ alignSelf: 'end' }}><input type="checkbox" checked={on('attention', '1')} onChange={(e) => router.push(url({ attention: e.target.checked ? '1' : null }))} /> Needs attention</label>
          <p className="hint" style={{ gridColumn: '1 / -1', margin: 0 }}>Needs attention = in New for more than a day, or travelling within 14 days and not yet won. Filters combine with the search; the column totals follow them.</p>
        </div>
      )}
    </div>
  );
}
