'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { fmtDate, money } from '@/lib/constants';
import type { Booking } from '@/lib/types';
import { Modal } from './Modal';
import { useToast } from './Toast';

const STATUS: Record<string, [string, string]> = {
  quoted: ['Not reserved yet', 'b-amber'], held: ['Held', 'b-accent'], confirmed: ['Reserved', 'b-green'], cancelled: ['Cancelled', 'b-red'],
};

/** Services from the Rates desk: reserve each with its provider, see references and deadlines, cancel. */
export function ProviderPanel({ booking, onChange, dirty }: { booking: Booking; onChange: (b: Booking) => void; dirty: boolean }) {
  const lines = booking.lines.filter((l) => l.api);
  const [busy, setBusy] = useState('');
  const [changed, setChanged] = useState<null | { lineId: string; old: number; now: number }>(null);
  const toast = useToast();
  if (!lines.length) return null;
  async function act(lineId: string, action: 'reserve' | 'cancel', acceptPrice: number | null = null) {
    if (dirty) return toast('Save the booking first.', 'err');
    if (action === 'cancel' && !window.confirm('Cancel this reservation with the provider? A cancellation fee may apply.')) return;
    setBusy(lineId);
    try {
      const r = await api<Booking>(`/api/bookings/${booking.id}/provider`, 'POST', { lineId, action, acceptPrice });
      onChange(r); setChanged(null);
      toast(action === 'cancel' ? 'Reservation cancelled.' : 'Reserved with the provider.');
    } catch (e) {
      const d = (e as Error & { data?: { newCost?: number } }).data;
      if (d?.newCost !== undefined) setChanged({ lineId, old: booking.lines.find((l) => l.id === lineId)?.cost ?? 0, now: d.newCost });
      else toast((e as Error).message, 'err');
    } finally { setBusy(''); }
  }
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section className="sheet">
      <h2>Provider reservations</h2>
      <div className="table-wrap"><table className="lines">
        <thead><tr><th>Service</th><th>Provider</th><th>Status</th><th>Deadlines</th><th><span className="sr">Actions</span></th></tr></thead>
        <tbody>{lines.map((l) => { const a = l.api!; const [st, badge] = STATUS[a.status]; const late = (x?: string) => x && x < today; return (
          <tr key={l.id}><td>{l.desc.split('\n')[0]}</td><td>{a.provider}</td>
            <td><span className={`badge ${badge}`}>{st}</span>{a.providerRef && <span style={{ display: 'block', fontSize: 13 }}>Ref. <b>{a.providerRef}</b></span>}{a.fee ? <span className="muted" style={{ display: 'block', fontSize: 12 }}>Fee {money(a.fee)}</span> : null}</td>
            <td style={{ fontSize: 13 }}>{a.timeLimit && a.status !== 'cancelled' && a.status !== 'confirmed' && <span className={late(a.timeLimit) ? 'overdue' : ''} style={{ display: 'block' }}>{a.status === 'held' ? 'Ticket by' : 'Hold until'} {fmtDate(a.timeLimit)}</span>}
              {a.deadline && a.status !== 'cancelled' && <span className={late(a.deadline) ? 'overdue' : 'muted'} style={{ display: 'block' }}>Free cancellation until {fmtDate(a.deadline)}</span>}
              {!a.timeLimit && !a.deadline && <span className="muted">Non-refundable</span>}</td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              {a.status === 'quoted' && <button className="btn primary" onClick={() => act(l.id, 'reserve')} disabled={busy !== '' || booking.status === 'cancelled'}>{busy === l.id ? 'Checking price…' : 'Reserve'}</button>}
              {(a.status === 'held' || a.status === 'confirmed') && <button className="btn" onClick={() => act(l.id, 'cancel')} disabled={busy !== ''}>{busy === l.id ? 'Cancelling…' : 'Cancel reservation'}</button>}
            </td></tr>); })}</tbody>
      </table></div>
      <p className="hint">Reserving re-checks the price with the provider first. The travellers’ names on this booking are sent with the reservation. Deadlines also appear on the Calendar.</p>
      {changed && (
        <Modal title="The price changed" onClose={() => setChanged(null)}>
          <p style={{ marginTop: 0 }}>The provider’s price is now <b>{money(changed.now)}</b> instead of {money(changed.old)} ({changed.now > changed.old ? '+' : ''}{money(changed.now - changed.old)}). Your markup stays the same, so the selling price changes too.</p>
          <div className="dlg-actions"><button className="btn" onClick={() => setChanged(null)}>Don’t reserve</button><button className="btn primary" onClick={() => act(changed.lineId, 'reserve', changed.now)} disabled={busy !== ''}>Reserve at {money(changed.now)}</button></div>
        </Modal>
      )}
    </section>
  );
}
