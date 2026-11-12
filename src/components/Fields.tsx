'use client';
import type { ReactNode } from 'react';

type Common = { label: string; id: string; wide?: boolean; disabled?: boolean };

export function TextField({ label, id, wide, disabled, value, onChange, type = 'text', placeholder, min, error }: Common & { value: string; onChange: (v: string) => void; type?: string; placeholder?: string; min?: string; error?: string }) {
  return (
    <label className={`fld ${wide ? 'wide' : ''}`} htmlFor={id}>
      <span>{label}</span>
      <input id={id} type={type} value={value} placeholder={placeholder} disabled={disabled} min={min || undefined}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} onChange={(e) => onChange(e.target.value)} />
      {error && <span id={`${id}-err`} className="fld-err">{error}</span>}
    </label>
  );
}

export function NumberField({ label, id, wide, disabled, value, onChange, step = '1' }: Common & { value: number; onChange: (v: number) => void; step?: string }) {
  return (
    <label className={`fld ${wide ? 'wide' : ''}`} htmlFor={id}>
      <span>{label}</span>
      <input id={id} type="number" min={0} step={step} value={Number.isFinite(value) ? value : 0} disabled={disabled} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </label>
  );
}

export function SelectField({ label, id, wide, disabled, value, onChange, options }: Common & { value: string; onChange: (v: string) => void; options: readonly (readonly [string, string])[] }) {
  return (
    <label className={`fld ${wide ? 'wide' : ''}`} htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

export function TextArea({ label, id, wide = true, disabled, value, onChange, rows = 3 }: Common & { value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className={`fld ${wide ? 'wide' : ''}`} htmlFor={id}>
      <span>{label}</span>
      <textarea id={id} rows={rows} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function ReadOnly({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`fld ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      <div className="ro">{children}</div>
    </div>
  );
}
