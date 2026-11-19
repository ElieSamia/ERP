/** dd/mm/yyyy on screen, YYYY-MM-DD in storage. Shared by the date field and its tests. */
export const isoToText = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
/** '' for empty, the ISO date when complete and real, null when incomplete or impossible (like 31/02/2026). */
export function textToIso(t: string): string | null {
  if (!t.trim()) return '';
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}
/** Digits only, with the slashes put in as you type. */
export const shapeDate = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 8); return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/'); };
