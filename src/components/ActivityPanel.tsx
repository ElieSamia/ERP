'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { fmtDateTime } from '@/lib/constants';
import type { Activity } from '@/lib/types';
import { useToast } from './Toast';

/** The chatter on every record: changes are logged by the server, notes are added here. */
export function ActivityPanel({ model, id, refreshKey = 0 }: { model: 'contact' | 'lead' | 'booking' | 'invoice' | 'purchase' | 'expense' | 'move'; id: string; refreshKey?: number }) {
  const [items, setItems] = useState<Activity[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const load = useCallback(() => api<Activity[]>(`/api/activity?model=${model}&id=${id}`).then(setItems).catch((e) => toast(e.message, 'err')), [model, id, toast]);
  useEffect(() => { load(); }, [load, refreshKey]);
  async function add() {
    if (!text.trim()) return toast('Write a note first.', 'err');
    setBusy(true);
    try {
      setItems(await api<Activity[]>('/api/activity', 'POST', { model, id, text }));
      setText('');
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  return (
    <aside className="chatter" aria-label="Activity">
      <h3>Activity</h3>
      <div className="note">
        <label className="sr" htmlFor="note">Internal note</label>
        <textarea id="note" rows={2} placeholder="Write an internal note" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn" onClick={add} disabled={busy}>{busy ? 'Saving…' : 'Log note'}</button>
      </div>
      <ol className="log">
        {items === null ? <li className="muted">Loading…</li> : items.length === 0 ? <li className="muted">No activity yet.</li> :
          items.map((a) => <li key={a.id}><div className="who">{a.by}<time>{fmtDateTime(a.at)}</time></div><p>{a.text}</p></li>)}
      </ol>
    </aside>
  );
}
