'use client';
import { useEffect, useRef, useState } from 'react';
import { isoToText, shapeDate, textToIso } from '@/lib/dates';

/**
 * A date field that always shows dd/mm/yyyy, whatever the browser's or computer's region. Browsers draw their
 * own date boxes in the computer's format (often mm/dd/yyyy), which a page can't change, so this field shows
 * its own text and keeps the browser's calendar behind a button. The value stays YYYY-MM-DD, as stored.
 */
const toText = isoToText;
const toIso = textToIso;
const shape = shapeDate;

type Props = {
  id?: string; value: string; onChange: (iso: string) => void; disabled?: boolean; min?: string; className?: string;
  'aria-label'?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string;
};
export function DateInput({ id, value, onChange, disabled, min, className, ...aria }: Props) {
  const [text, setText] = useState(toText(value));
  const [bad, setBad] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  // Follow changes made elsewhere (a reset, the calendar, another field clearing this one).
  useEffect(() => { if (toIso(text) !== value) { setText(toText(value)); setBad(false); } }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  function type(v: string) {
    const next = v.length < text.length ? v : shape(v); // deleting keeps what's left; typing forward adds the slashes
    setText(next);
    const iso = toIso(next);
    if (iso !== null) { setBad(false); if (iso !== value) onChange(iso); }
  }
  function blur() {
    const iso = toIso(text);
    if (iso === null) setBad(true); else { setBad(false); setText(toText(iso)); }
  }
  function openCalendar() {
    const el = pick.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  }
  return (
    <span className={`dinput ${className ?? ''} ${bad ? 'bad' : ''}`}>
      <input id={id} type="text" inputMode="numeric" autoComplete="off" placeholder="dd/mm/yyyy" maxLength={10} value={text} disabled={disabled}
        onChange={(e) => type(e.target.value)} onBlur={blur} {...aria} aria-invalid={bad || aria['aria-invalid'] || undefined} />
      <button type="button" className="dbtn" onClick={openCalendar} disabled={disabled} aria-label="Choose from the calendar" tabIndex={-1}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16v15H4zM4 10h16M8 3v4M16 3v4" /></svg>
      </button>
      <input ref={pick} type="date" className="dpick" tabIndex={-1} aria-hidden="true" value={value} min={min || undefined} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}
