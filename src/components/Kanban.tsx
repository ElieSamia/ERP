'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { LEAD_STAGES, fmtDate, money } from '@/lib/constants';
import type { Lead } from '@/lib/types';
import { useToast } from './Toast';

export function Kanban({ leads }: { leads: Lead[] }) {
  const [items, setItems] = useState(leads);
  const [over, setOver] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  useEffect(() => setItems(leads), [leads]);

  async function move(id: string, stage: Lead['stage']) {
    const prev = items;
    const lead = items.find((x) => x.id === id);
    if (!lead || lead.stage === stage) return;
    setItems(items.map((x) => (x.id === id ? { ...x, stage } : x)));
    try {
      await api(`/api/leads/${id}`, 'PATCH', { stage });
      toast(`Moved to ${LEAD_STAGES.find((s) => s[0] === stage)?.[1]}.`);
      router.refresh();
    } catch (e) { setItems(prev); toast((e as Error).message, 'err'); }
  }

  return (
    <div className="kanban">
      {LEAD_STAGES.map(([k, lb]) => {
        const col = items.filter((l) => l.stage === k);
        return (
          <section key={k} aria-label={lb} className={`kcol ${over === k ? 'drop' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(k); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData('text/plain'), k); }}>
            <div className="khead"><h3>{lb}</h3><span>{col.length}, {money(col.reduce((s, l) => s + (l.budget || 0), 0))}</span></div>
            {col.map((l) => (
              <article key={l.id} className="kcard" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', l.id)}>
                <Link href={`/crm/${l.id}`}>
                  <h4>{l.title}</h4><p>{l.contactName}</p><p>{l.destination || 'No destination'}, {fmtDate(l.travelDate)}</p>
                  <div className="kf"><span>{money(l.budget)}</span><span className="muted">{l.pax} pax</span></div>
                </Link>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
