'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { MOVE_STATES, money, r2, todayISO, type LedgerAccount, type Move, type MoveLine } from '@/lib/constants';
import { TextField, SelectField, ReadOnly } from './Fields';
import { ActivityPanel } from './ActivityPanel';
import { useToast } from './Toast';

type Draft = Pick<Move, 'journal' | 'date' | 'label' | 'partnerId' | 'lines'>;
type Opt = { id: string; name: string };
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));
const blank = (): MoveLine => ({ id: newId(), account: '', partnerId: '', label: '', debit: 0, credit: 0 });
const pick = (m: Move): Draft => ({ journal: m.journal, date: m.date, label: m.label, partnerId: m.partnerId, lines: m.lines });

export function MoveForm({ initial, chart, journals, contacts, opening, sourceHref, openingOffset }: {
  initial?: Move; chart: LedgerAccount[]; journals: { code: string; name: string }[]; contacts: Opt[]; opening?: boolean; sourceHref?: string; openingOffset: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const start: Draft = initial ? pick(initial) : opening
    ? { journal: 'OD', date: `${new Date().getFullYear()}-01-01`, label: 'Opening balances', partnerId: '', lines: [{ ...blank(), label: 'Opening balance' }, { ...blank(), account: openingOffset, label: 'Opening balances offset' }] }
    : { journal: 'OD', date: todayISO(), label: '', partnerId: '', lines: [blank(), blank()] };
  const [m, setM] = useState(initial);
  const [saved, setSaved] = useState(start);
  const [f, setF] = useState(start);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const ed = !m || (!m.auto && m.status === 'draft');
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  const dr = r2(f.lines.reduce((s, l) => s + (l.debit || 0), 0)), cr = r2(f.lines.reduce((s, l) => s + (l.credit || 0), 0));
  const acctName = (c: string) => { const a = chart.find((x) => x.code === c); return a ? `${a.code} ${a.name}` : c; };
  const setLine = (id: string, p: Partial<MoveLine>) => setF({ ...f, lines: f.lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const apply = (r: Move) => { setM(r); setSaved(pick(r)); setF(pick(r)); setTick((x) => x + 1); router.refresh(); };

  async function save() {
    setBusy(true);
    try {
      if (m) { apply(await api<Move>(`/api/accounting/moves/${m.id}`, 'PATCH', f)); toast('Entry saved.'); }
      else { const r = await api<Move>('/api/accounting/moves', 'POST', f); toast('Draft entry saved.'); router.push(`/accounting/entries/${r.id}`); router.refresh(); }
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function act(action: 'post' | 'draft') {
    if (!m) return;
    if (dirty) return toast('Save your changes first.', 'err');
    try { const r = await api<Move>(`/api/accounting/moves/${m.id}/action`, 'POST', { action }); apply(r); toast(action === 'post' ? `Posted as ${r.ref}.` : 'Back to draft.'); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  async function remove() {
    if (!m || !window.confirm('Delete this draft entry?')) return;
    try { await api(`/api/accounting/moves/${m.id}`, 'DELETE'); toast('Deleted.'); router.push('/accounting'); router.refresh(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  const accOpts: [string, string][] = [['', 'Choose…'], ...chart.map((a) => [a.code, `${a.code} ${a.name}`] as [string, string])];
  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href="/accounting">Accounting</Link><span className="sep">/</span><span>{m?.ref ?? (opening ? 'Opening balances' : 'New entry')}</span></div>
        <div className="cp-actions">
          {dirty && <span className="dirty">Unsaved changes</span>}
          {ed && <button className="btn primary" onClick={save} disabled={busy || (!!m && !dirty)}>{busy ? 'Saving…' : 'Save'}</button>}
          {!m && <Link className="btn" href="/accounting">Cancel</Link>}
          {m && ed && <button className="btn" onClick={() => act('post')}>Post entry</button>}
          {m && !m.auto && m.status === 'posted' && <button className="btn" onClick={() => act('draft')}>Reset to draft</button>}
          {m && ed && <button className="btn ghost" onClick={remove}>Delete</button>}
          {sourceHref && <Link className="btn" href={sourceHref}>Open the source document</Link>}
        </div>
        <div className="cp-tools"><ol className="statusbar">{MOVE_STATES.map(([k, l]) => <li key={k} className={k === (m?.status ?? 'draft') ? 'on' : ''}>{l}</li>)}</ol></div>
      </div>
      <div className="recpage">
        <div className="recmain">
          {m?.auto && <p className="banner">Created automatically from a document. To change it, change the document; the entry follows.</p>}
          {opening && !m && <p className="banner">Enter what each bank, cash or wallet account held on the date you start, and any amounts customers owed you or you owed suppliers. The offset goes to {acctName(openingOffset)}.</p>}
          <section className="sheet">
            <div className="grid">
              {ed ? <SelectField id="m-j" label="Journal" value={f.journal} options={journals.map((j) => [j.code, `${j.name} (${j.code})`] as [string, string])} onChange={(v) => setF({ ...f, journal: v })} />
                : <ReadOnly label="Journal">{journals.find((j) => j.code === f.journal)?.name ?? f.journal} ({f.journal})</ReadOnly>}
              <TextField id="m-d" label="Accounting date" type="date" value={f.date} onChange={(v) => setF({ ...f, date: v })} disabled={!ed} />
              <TextField id="m-l" label="Reference" wide value={f.label} onChange={(v) => setF({ ...f, label: v })} disabled={!ed} />
            </div>
          </section>
          <section className="sheet">
            <h2>Journal items</h2>
            <div className="table-wrap">
              <table className="lines">
                <thead><tr><th>Account</th><th>Partner</th><th>Label</th><th className="num">Debit</th><th className="num">Credit</th>{ed && <th><span className="sr">Remove</span></th>}</tr></thead>
                <tbody>
                  {f.lines.map((l) => ed ? (
                    <tr key={l.id}>
                      <td><select className="w-acc" aria-label="Account" value={l.account} onChange={(e) => setLine(l.id, { account: e.target.value })}>{accOpts.map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}</select></td>
                      <td><select aria-label="Partner" value={l.partnerId} onChange={(e) => setLine(l.id, { partnerId: e.target.value })}><option value="">None</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                      <td><input className="w-desc" aria-label="Label" value={l.label} onChange={(e) => setLine(l.id, { label: e.target.value })} /></td>
                      <td className="num"><input className="w-num" type="number" min={0} step="0.01" aria-label="Debit" value={l.debit || ''} onChange={(e) => setLine(l.id, { debit: parseFloat(e.target.value) || 0 })} /></td>
                      <td className="num"><input className="w-num" type="number" min={0} step="0.01" aria-label="Credit" value={l.credit || ''} onChange={(e) => setLine(l.id, { credit: parseFloat(e.target.value) || 0 })} /></td>
                      <td><button className="icon-btn" aria-label="Remove line" onClick={() => setF({ ...f, lines: f.lines.filter((x) => x.id !== l.id) })}>×</button></td>
                    </tr>
                  ) : (
                    <tr key={l.id}>
                      <td><Link className="link" href={`/accounting/ledger/${l.account}`}>{acctName(l.account)}</Link></td>
                      <td>{contacts.find((c) => c.id === l.partnerId)?.name ?? ''}</td><td>{l.label}</td>
                      <td className="num">{l.debit ? money(l.debit) : ''}</td><td className="num">{l.credit ? money(l.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={3}><b>Total</b></td><td className="num"><b>{money(dr)}</b></td><td className="num"><b>{money(cr)}</b></td>{ed && <td />}</tr></tfoot>
              </table>
            </div>
            {ed && <div className="addrow"><button className="btn" onClick={() => setF({ ...f, lines: [...f.lines, blank()] })}>Add line</button>
              <span className={Math.abs(dr - cr) < 0.005 ? 'muted' : 'overdue'} style={{ alignSelf: 'center', fontSize: 13.5 }}>{Math.abs(dr - cr) < 0.005 ? 'Balanced.' : `Out of balance by ${money(Math.abs(dr - cr))}.`}</span></div>}
          </section>
        </div>
        {m ? <ActivityPanel model="move" id={m.id} refreshKey={tick} /> : <aside className="chatter"><h3>Activity</h3><p className="muted" style={{ margin: 0 }}>Nothing is saved until you select Save. Posting needs debits equal to credits.</p></aside>}
      </div>
    </>
  );
}
