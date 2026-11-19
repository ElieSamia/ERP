'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { fmtDate } from '@/lib/constants';
import type { CalEvent, CalKind } from '@/lib/calendar';
import { Modal } from './Modal';
import { useToast } from './Toast';

const KINDS: [CalKind, string, string][] = [
  ['trip', 'Departures and returns', 'k-flight'], ['service', 'Services', 'k-service'], ['due', 'Customer payments due', 'k-due'],
  ['bill', 'Supplier payments due', 'k-bill'], ['lead', 'Opportunities', 'k-lead'], ['quote', 'Quotes expiring', 'k-quote'], ['deadline', 'Provider deadlines', 'k-bill'], ['reminder', 'Reminders', 'k-task'],
];
const cls = (e: CalEvent) => (e.kind === 'reminder' && e.done ? 'k-done' : KINDS.find((k) => k[0] === e.kind)![2]);
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CalendarView({ month, days, events, today, view }: { month: string; days: string[]; events: CalEvent[]; today: string; view: 'month' | 'list' }) {
  const [on, setOn] = useState<Set<CalKind>>(new Set(KINDS.map((k) => k[0])));
  const [sel, setSel] = useState<string>(today.startsWith(month) ? today : `${month}-01`);
  const [rem, setRem] = useState<null | { id?: string; date: string; time: string; title: string; note: string }>(null);
  const router = useRouter();
  const toast = useToast();
  const shown = useMemo(() => events.filter((e) => on.has(e.kind)), [events, on]);
  const byDay = useMemo(() => { const m = new Map<string, CalEvent[]>(); for (const e of shown) m.set(e.date, [...(m.get(e.date) ?? []), e]); return m; }, [shown]);
  const toggle = (k: CalKind) => { const s = new Set(on); if (s.has(k)) s.delete(k); else s.add(k); setOn(s); };
  const [y, mo] = month.split('-').map(Number);
  const title = new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shift = (n: number) => { const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return `/calendar?m=${d.toISOString().slice(0, 7)}&view=${view}`; };

  async function saveRem() {
    if (!rem) return;
    try {
      if (rem.id) await api(`/api/reminders/${rem.id}`, 'PATCH', { date: rem.date, time: rem.time, title: rem.title, note: rem.note });
      else await api('/api/reminders', 'POST', { date: rem.date, time: rem.time, title: rem.title, note: rem.note });
      toast(rem.id ? 'Reminder saved.' : 'Reminder added.'); setRem(null); router.refresh();
    } catch (e) { toast((e as Error).message, 'err'); }
  }
  async function done(e: CalEvent) {
    try { await api(`/api/reminders/${e.id}`, 'PATCH', { done: !e.done }); router.refresh(); } catch (x) { toast((x as Error).message, 'err'); }
  }
  async function remove(id: string) {
    if (!window.confirm('Delete this reminder?')) return;
    try { await api(`/api/reminders/${id}`, 'DELETE'); setRem(null); toast('Reminder deleted.'); router.refresh(); } catch (x) { toast((x as Error).message, 'err'); }
  }

  const item = (e: CalEvent) => (
    <li key={e.id} className="ag">
      <i className={`dot ${cls(e)}`} aria-hidden="true" />
      <span className="ag-time">{e.time ?? ''}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {e.href ? <Link href={e.href}><b className={e.done ? 'muted' : ''}>{e.title}</b></Link> : <b className={e.done ? 'muted' : ''} style={e.done ? { textDecoration: 'line-through' } : undefined}>{e.title}</b>}
        {e.late && <span className="badge b-red" style={{ marginLeft: 6 }}>Overdue</span>}
        <span className="muted ag-sub">{e.sub}{e.note ? ` · ${e.note}` : ''}</span>
      </span>
      {e.kind === 'reminder' && <span style={{ whiteSpace: 'nowrap' }}>
        <button className="btn" onClick={() => done(e)}>{e.done ? 'Not done' : 'Done'}</button>{' '}
        <button className="btn" onClick={() => setRem({ id: e.id, date: e.date, time: e.time ?? '', title: e.title, note: e.note ?? '' })}>Edit</button>
      </span>}
    </li>
  );

  return (
    <>
      <div className="calnav">
        <Link className="btn" href={shift(-1)} aria-label="Previous month">‹</Link>
        <Link className="btn" href={`/calendar?m=${today.slice(0, 7)}&view=${view}`}>Today</Link>
        <Link className="btn" href={shift(1)} aria-label="Next month">›</Link>
        <h2>{title}</h2>
        <span style={{ flex: 1 }} />
        <div className="chips">{(['month', 'list'] as const).map((v) => <Link key={v} className={`chip ${view === v ? 'on' : ''}`} href={`/calendar?m=${month}&view=${v}`}>{v === 'month' ? 'Month' : 'List'}</Link>)}</div>
        <button className="btn primary" onClick={() => setRem({ date: sel, time: '', title: '', note: '' })}>Add reminder</button>
      </div>
      <div className="chips" style={{ marginBottom: 12 }}>
        {KINDS.map(([k, l, c]) => <button key={k} className={`chip ${on.has(k) ? 'on' : ''}`} aria-pressed={on.has(k)} onClick={() => toggle(k)}><i className={`dot ${c}`} aria-hidden="true" style={{ marginRight: 6 }} />{l}</button>)}
      </div>
      {view === 'month' ? (
        <div className="calwrap">
          <div className="cal" role="grid" aria-label={title}>
            {DOW.map((d) => <div key={d} className="cal-dow" role="columnheader">{d}</div>)}
            {days.map((d) => { const list = byDay.get(d) ?? []; return (
              <div key={d} role="gridcell" className={`cal-day ${d.startsWith(month) ? '' : 'out'} ${d === today ? 'today' : ''} ${d === sel ? 'sel' : ''}`}>
                <button className="cal-num" onClick={() => setSel(d)} aria-label={`${fmtDate(d)}, ${list.length} item${list.length === 1 ? '' : 's'}`}>{Number(d.slice(8))}</button>
                {list.slice(0, 3).map((e) => <button key={e.id} className={`ev ${cls(e)}`} title={`${e.title}. ${e.sub}`} onClick={() => setSel(d)}>{e.time ? `${e.time} ` : ''}{e.title}</button>)}
                {list.length > 3 && <button className="cal-more" onClick={() => setSel(d)}>+{list.length - 3} more</button>}
              </div>); })}
          </div>
          <section className="sheet">
            <div className="cp" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>{fmtDate(sel)}</h2>
              <div className="cp-actions"><button className="btn" onClick={() => setRem({ date: sel, time: '', title: '', note: '' })}>Add reminder</button></div></div>
            {(byDay.get(sel) ?? []).length ? <ul className="agenda">{(byDay.get(sel) ?? []).map(item)}</ul> : <p className="muted" style={{ margin: 0 }}>Nothing on this day.</p>}
          </section>
        </div>
      ) : (
        <section className="sheet">
          {shown.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing this month.</p> : [...byDay.entries()].filter(([d]) => d.startsWith(month)).map(([d, list]) => (
            <div key={d} className="agday"><h3 className={d === today ? 'today' : ''}>{fmtDate(d)}{d === today ? ', today' : ''}</h3><ul className="agenda">{list.map(item)}</ul></div>
          ))}
        </section>
      )}
      {rem && (
        <Modal title={rem.id ? 'Edit reminder' : 'New reminder'} onClose={() => setRem(null)}>
          <div className="grid">
            <label className="fld wide" htmlFor="r-t"><span>What to remember</span><input id="r-t" autoFocus value={rem.title} onChange={(e) => setRem({ ...rem, title: e.target.value })} placeholder="Call Mansour about the Dubai visas" /></label>
            <label className="fld" htmlFor="r-d"><span>Date</span><input id="r-d" type="date" value={rem.date} onChange={(e) => setRem({ ...rem, date: e.target.value })} /></label>
            <label className="fld" htmlFor="r-h"><span>Time (optional)</span><input id="r-h" type="time" value={rem.time} onChange={(e) => setRem({ ...rem, time: e.target.value })} /></label>
            <label className="fld wide" htmlFor="r-n"><span>Note</span><textarea id="r-n" rows={3} value={rem.note} onChange={(e) => setRem({ ...rem, note: e.target.value })} /></label>
          </div>
          <p className="hint">Reminders are shared with everyone on your team.</p>
          <div className="dlg-actions">
            {rem.id && <button className="btn ghost" onClick={() => remove(rem.id!)}>Delete</button>}
            <button className="btn" onClick={() => setRem(null)}>Cancel</button>
            <button className="btn primary" onClick={saveRem}>Save</button>
          </div>
        </Modal>
      )}
    </>
  );
}
