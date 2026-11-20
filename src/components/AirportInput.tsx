'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { airportLabel, loadAirports, searchAirports, type Airport } from '@/lib/airports';

/**
 * Airport picker for the Rates desk: type a city, airport name, country or code and choose from the list.
 * The value is the 3-letter IATA code. A typed code is accepted even if it isn't in the list.
 */
export function AirportInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (code: string) => void; placeholder?: string }) {
  const [all, setAll] = useState<Airport[] | null>(null);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [err, setErr] = useState('');
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const load = () => { if (!all) loadAirports().then(setAll).catch((e) => setErr((e as Error).message)); };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  const current = all?.find((a) => a[0] === value);
  const shown = editing ? text : value ? (current ? `${value} · ${airportLabel(current)}` : value) : '';
  const matches = all && editing ? searchAirports(all, text) : [];

  function choose(a: Airport) { onChange(a[0]); setEditing(false); setOpen(false); }
  function done() {
    const t = text.trim();
    if (!t) onChange('');
    else if (/^[a-z]{3}$/i.test(t)) onChange(t.toUpperCase());
    else if (matches.length === 1) onChange(matches[0][0]);
    setEditing(false); setOpen(false);
  }
  function key(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && open && matches[active]) { e.preventDefault(); choose(matches[active]); }
    else if (e.key === 'Escape') { setOpen(false); setEditing(false); }
  }
  return (
    <span className="apick">
      <input ref={inputRef} id={id} role="combobox" aria-expanded={open && matches.length > 0} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined} autoComplete="off" placeholder={placeholder ?? 'City, airport or code'}
        value={shown}
        onFocus={(e) => { load(); setEditing(true); setText(value ? '' : text); setActive(0); e.target.select(); }}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
        onBlur={() => setTimeout(done, 120)} onKeyDown={key} />
      {open && editing && text.trim() && (
        <ul id={listId} role="listbox" className="apick-list">
          {err ? <li className="muted">{err} You can still type a 3-letter code.</li>
            : !all ? <li className="muted">Loading airports…</li>
            : matches.length === 0 ? <li className="muted">No airport matches “{text}”. Type its 3-letter code if you know it.</li>
            : matches.map((a, i) => (
              <li key={a[0]} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? 'on' : ''}
                onMouseDown={(e) => { e.preventDefault(); choose(a); }} onMouseEnter={() => setActive(i)}>
                <b>{a[0]}</b><span><span className="apn">{a[5] === -1 ? `${a[1]}` : a[1]}</span><small>{airportLabel(a)}</small></span>
              </li>))}
        </ul>
      )}
    </span>
  );
}
