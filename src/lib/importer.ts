import { ObjectId } from 'mongodb';
import { db } from './db';
import { HttpError } from './api';

/**
 * Importing customers and suppliers from Excel (.xlsx) or CSV: the file is read once and kept an hour, the
 * columns are matched to fields (guessed from the headers), then rows become contacts. Duplicates (same email,
 * or same phone) are skipped or updated; every problem is reported with its row number.
 */
export const FIELDS: [string, string][] = [
  ['name', 'Name'], ['type', 'Type'], ['email', 'Email'], ['phone', 'Phone'], ['city', 'City'], ['country', 'Country'],
  ['creditLimit', 'Credit limit'], ['marketing', 'Email offers (yes/no)'], ['tags', 'Tags'], ['notes', 'Notes'],
];
const GUESS: [string, RegExp][] = [
  ['name', /^(full ?name|name|customer|client|contact|company|nom|الاسم)/i], ['email', /e-?mail|courriel|البريد/i], ['phone', /phone|mobile|tel|whatsapp|gsm|الهاتف/i],
  ['city', /city|ville|town|المدينة/i], ['country', /country|pays|البلد|الدولة/i], ['type', /^type|category|kind/i], ['creditLimit', /credit/i],
  ['marketing', /marketing|newsletter|consent|offers|subscri/i], ['tags', /tags?|labels?|groups?/i], ['notes', /notes?|comments?|remarks?/i],
];

/** Reads CSV (comma, semicolon or tab; quoted values) into rows of text. */
function parseCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, '');
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = [';', '\t', ','].reduce((best, c) => (first.split(c).length > first.split(best).length ? c : best), ',');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
async function parseXlsx(buf: Buffer): Promise<string[][]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const vals = (r.values as unknown[]).slice(1).map((v) => {
      if (v == null) return '';
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (typeof v === 'object') { const o = v as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string }; return String(o.text ?? o.result ?? o.richText?.map((x) => x.text).join('') ?? o.hyperlink ?? ''); }
      return String(v);
    });
    rows.push(vals);
  });
  return rows.filter((r) => r.some((c) => c.trim()));
}

export async function readFile(name: string, buf: Buffer, by: string) {
  if (buf.length > 4 * 1024 * 1024) throw new HttpError(400, 'The file is over 4 MB. Split it into smaller files.');
  let rows: string[][];
  if (/\.xlsx$/i.test(name)) { try { rows = await parseXlsx(buf); } catch { throw new HttpError(400, 'That Excel file can’t be read. Save it again as .xlsx (or CSV) and retry.'); } }
  else if (/\.(csv|txt)$/i.test(name)) rows = parseCsv(buf.toString('utf8'));
  else throw new HttpError(400, 'Choose an Excel (.xlsx) or CSV file. For an old .xls file, save it as .xlsx first.');
  if (rows.length < 2) throw new HttpError(400, 'The file needs a header row and at least one row of data.');
  if (rows.length > 5001) throw new HttpError(400, 'Up to 5,000 rows at a time. Split the file and import it in parts.');
  const headers = rows[0].map((h, i) => h.trim() || `Column ${i + 1}`);
  const data = rows.slice(1).map((r) => headers.map((_, i) => (r[i] ?? '').trim()));
  const mapping: Record<string, number> = {};
  for (const [field, re] of GUESS) { const i = headers.findIndex((h, j) => re.test(h) && !Object.values(mapping).includes(j)); if (i >= 0) mapping[field] = i; }
  const ins = await (await db()).collection('imports').insertOne({ name, headers, rows: data, by, at: new Date(), expiresAt: new Date(Date.now() + 3600e3) });
  return { token: String(ins.insertedId), name, headers, sample: data.slice(0, 5), total: data.length, mapping };
}

const TYPE_OF = (v: string, dflt: string) => {
  const x = v.toLowerCase();
  if (/supplier|vendor|fournisseur|مورد/.test(x)) return 'supplier';
  if (/agency|agence|b2b|وكالة/.test(x)) return 'agency';
  if (/corporate|company|société|business|شركة/.test(x)) return 'corporate';
  if (/customer|individual|client|b2c|person|فرد/.test(x)) return 'customer';
  return dflt;
};
const yes = (v: string) => /^(y|yes|true|1|oui|نعم|x|subscribed|opt.?in)$/i.test(v.trim());

export async function runImport(token: string, mapping: Record<string, number>, defaultType: string, onDuplicate: 'skip' | 'update', by: string) {
  const d = await db();
  const job = ObjectId.isValid(token) ? await d.collection('imports').findOne({ _id: new ObjectId(token) }) : null;
  if (!job) throw new HttpError(410, 'The uploaded file has expired. Upload it again.');
  if (mapping.name === undefined) throw new HttpError(400, 'Match a column to Name: it’s the only field required.');
  const get = (r: string[], f: string) => (mapping[f] !== undefined && mapping[f] >= 0 ? r[mapping[f]] ?? '' : '');
  const contacts = d.collection('contacts');
  const res = { created: 0, updated: 0, skipped: 0, problems: [] as { row: number; reason: string }[] };
  const seenEmail = new Set<string>(), seenPhone = new Set<string>();
  for (const [i, r] of (job.rows as string[][]).entries()) {
    const rowNo = i + 2; // as in the spreadsheet, with its header row
    const name = get(r, 'name').replace(/\s+/g, ' ');
    if (!name) { res.problems.push({ row: rowNo, reason: 'No name' }); continue; }
    const email = get(r, 'email').toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { res.problems.push({ row: rowNo, reason: `Email “${email}” isn’t valid` }); continue; }
    const phone = get(r, 'phone');
    const digits = phone.replace(/\D/g, '');
    const limitRaw = get(r, 'creditLimit').replace(/[^\d.]/g, '');
    const doc = {
      name, type: TYPE_OF(get(r, 'type'), defaultType), email, phone, city: get(r, 'city'), country: get(r, 'country'),
      creditLimit: limitRaw ? Number(limitRaw) || 0 : 0, notes: get(r, 'notes'),
      tags: get(r, 'tags').split(/[,;|]/).map((x) => x.trim()).filter(Boolean).slice(0, 20),
    };
    // The same person twice in the file counts once.
    if ((email && seenEmail.has(email)) || (digits.length >= 7 && seenPhone.has(digits))) { res.problems.push({ row: rowNo, reason: 'Same email or phone as an earlier row in the file' }); continue; }
    if (email) seenEmail.add(email);
    if (digits.length >= 7) seenPhone.add(digits);
    const existing = (email ? await contacts.findOne({ email }) : null)
      ?? (digits.length >= 7 ? (await contacts.find({ phone: { $regex: digits.slice(-7).split('').join('\\D*') } }).toArray()).find((c) => String(c.phone).replace(/\D/g, '').endsWith(digits.slice(-9))) ?? null : null);
    if (existing) {
      if (onDuplicate === 'skip') { res.skipped++; continue; }
      const set: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(doc)) if (k !== 'tags' && v !== '' && !(k === 'creditLimit' && !limitRaw)) set[k] = v;
      if (mapping.marketing !== undefined) set.marketing = yes(get(r, 'marketing')) ? 'yes' : 'no';
      await contacts.updateOne({ _id: existing._id }, { $set: set, ...(doc.tags.length ? { $addToSet: { tags: { $each: doc.tags } } } : {}) } as never);
      res.updated++;
      continue;
    }
    await contacts.insertOne({ ...doc, marketing: mapping.marketing !== undefined && yes(get(r, 'marketing')) ? 'yes' : 'no', waMarketing: 'no', portalAccess: 'no', createdAt: new Date(), createdBy: `${by} (import)` });
    res.created++;
  }
  await d.collection('imports').deleteOne({ _id: job._id });
  return res;
}
