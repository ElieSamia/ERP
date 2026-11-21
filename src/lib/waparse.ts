/**
 * Reads the website's WhatsApp messages, so a chat can become an opportunity with its details filled in:
 * the package message ("Package Inquiry Details", one "Label: value" per line, "Ref ID: REQ-…") and the
 * pre-filled texts of service and destination pages.
 */
export type WaParsed = {
  kind: 'package' | 'service' | 'destination' | 'other'; requestId: string; fields: Record<string, string>; topic: string;
};
const LABELS: Record<string, string> = {
  'package': 'packageName', 'full name': 'fullName', 'email': 'email', 'phone': 'phone', 'preferred departure': 'departureDate',
  'number of nights': 'numberOfNights', 'adults': 'adults', 'children': 'children', 'departure city': 'departureCity', 'room type': 'roomType',
  'additional notes': 'notes', 'ref id': 'requestId',
};
/** Accepts 2028-09-09, 09/09/2028 or 9-9-2028 and returns YYYY-MM-DD (day first, as used in Lebanon). */
export function anyDate(v: string) {
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}
export function parseWa(text: string): WaParsed {
  const fields: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    // "Adults: 2 Children: 1" shares a line in the template: split on every known label.
    const re = /(Package|Full Name|Email|Phone|Preferred Departure|Number of Nights|Adults|Children|Departure City|Room Type|Additional Notes|Ref ID)\s*:\s*/gi;
    const hits = [...line.matchAll(re)];
    hits.forEach((h, i) => {
      const key = LABELS[h[1].toLowerCase()];
      const end = i + 1 < hits.length ? hits[i + 1].index : line.length;
      const val = line.slice((h.index ?? 0) + h[0].length, end).trim();
      if (key && val && !(key in fields)) fields[key] = val;
    });
  }
  const requestId = fields.requestId || (/\bREQ-[A-Z0-9-]{6,}/i.exec(text)?.[0] ?? '');
  if (fields.departureDate) fields.departureDate = anyDate(fields.departureDate);
  if (fields.packageName || /package inquiry details/i.test(text)) return { kind: 'package', requestId, fields, topic: fields.packageName ?? '' };
  const svc = /more about your (.+?) service/i.exec(text);
  if (svc) return { kind: 'service', requestId, fields, topic: svc[1].trim() };
  const dst = /plan a trip to (.+?)(?:[.!,]|\s+please|$)/i.exec(text);
  if (dst) return { kind: 'destination', requestId, fields, topic: dst[1].trim() };
  return { kind: 'other', requestId, fields, topic: '' };
}
