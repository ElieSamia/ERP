import { BSON } from 'mongodb';
import { db } from './db';
import { HttpError } from './api';

/**
 * Settings export and import: everything you set up, in one file, to load into a fresh database. Business data
 * (contacts, bookings, invoices…) isn't included; that's what backups are for. Saved passwords and keys stay
 * encrypted, so they work only in an ERP with the same AUTH_SECRET.
 */
export const SECTIONS: { key: string; label: string; settings: string[]; collections: string[]; note?: string }[] = [
  { key: 'company', label: 'Company, logo, document layouts and appearance', settings: ['company', 'branding', 'appearance'], collections: [] },
  { key: 'sales', label: 'Pricing, VAT, payment terms and booking settings', settings: ['pricing', 'finance', 'booking'], collections: [] },
  { key: 'accounting', label: 'Accounting settings and chart of accounts', settings: ['accounting'], collections: ['accounts'], note: 'Best imported into a fresh system, before any accounting entries.' },
  { key: 'email', label: 'Email sending (Zoho)', settings: ['mail'], collections: [], note: 'Includes the saved password, encrypted.' },
  { key: 'marketing', label: 'Marketing connection and audiences', settings: ['marketing'], collections: ['audiences'] },
  { key: 'whatsapp', label: 'WhatsApp Business', settings: ['whatsapp'], collections: [], note: 'Includes the access token and app secret, encrypted.' },
  { key: 'enquiries', label: 'Enquiry sources and hosted form', settings: ['enquiry'], collections: ['enqsources'], note: 'Keeps the same keys, so your website keeps working without a change.' },
  { key: 'portal', label: 'B2B portal settings and roles', settings: ['portal'], collections: ['portalRoles'] },
  { key: 'rates', label: 'Rates desk connections (Duffel and others)', settings: [], collections: ['connections'], note: 'Includes credentials, encrypted.' },
  { key: 'products', label: 'Products and pricing catalogue', settings: [], collections: ['products'] },
  { key: 'users', label: 'Staff users', settings: [], collections: ['users'], note: 'With their passwords and two-step sign-in. Existing users with the same email are updated, others kept.' },
];

export async function exportSettings(keys: string[], by: string) {
  const d = await db();
  const chosen = SECTIONS.filter((s) => keys.includes(s.key));
  if (!chosen.length) throw new HttpError(400, 'Choose at least one section.');
  const sections: Record<string, { settings: unknown[]; collections: Record<string, unknown[]> }> = {};
  for (const s of chosen) {
    sections[s.key] = {
      settings: await d.collection<{ _id: string }>('settings').find({ _id: { $in: s.settings } }).toArray(),
      collections: Object.fromEntries(await Promise.all(s.collections.map(async (c) => [c, await d.collection(c).find({}).toArray()]))),
    };
  }
  const company = await d.collection<{ _id: string; name?: string }>('settings').findOne({ _id: 'company' });
  return BSON.EJSON.stringify({ format: 'travel-erp-settings', version: 1, exportedAt: new Date(), exportedBy: by, company: company?.name ?? '', sections }, undefined, 1, { relaxed: false });
}

type Parsed = { format: string; version: number; exportedAt: Date; exportedBy: string; company: string; sections: Record<string, { settings: Record<string, unknown>[]; collections: Record<string, Record<string, unknown>[]> }> };
export function readSettingsFile(text: string): Parsed {
  let p: Parsed;
  try { p = BSON.EJSON.parse(text, { relaxed: false }) as Parsed; } catch { throw new HttpError(400, 'That file isn’t a settings export.'); }
  if (p?.format !== 'travel-erp-settings' || !p.sections) throw new HttpError(400, 'That file isn’t a settings export from this ERP.');
  return p;
}
export function previewSettings(p: Parsed) {
  return {
    company: p.company, exportedAt: p.exportedAt, exportedBy: p.exportedBy,
    sections: SECTIONS.filter((s) => p.sections[s.key]).map((s) => ({ key: s.key, label: s.label, note: s.note ?? '', items: p.sections[s.key].settings.length + Object.values(p.sections[s.key].collections).reduce((n, r) => n + r.length, 0) })),
  };
}

/** Applies the chosen sections: settings records are replaced; collections replaced, except staff users (merged by email). */
export async function importSettings(p: Parsed, keys: string[], meEmail: string) {
  const d = await db();
  const done: string[] = [];
  for (const s of SECTIONS.filter((x) => keys.includes(x.key) && p.sections[x.key])) {
    const sec = p.sections[s.key];
    for (const doc of sec.settings) await d.collection<{ _id: string }>('settings').replaceOne({ _id: String(doc._id) }, doc as never, { upsert: true });
    for (const [c, rows] of Object.entries(sec.collections)) {
      if (!s.collections.includes(c)) continue; // only what this section is meant to carry
      if (c === 'users') {
        for (const u of rows) {
          const { _id, ...rest } = u; void _id;
          await d.collection('users').updateOne({ email: rest.email }, { $set: rest }, { upsert: true });
        }
        // Never lock yourself out: the person importing stays an active administrator.
        await d.collection('users').updateOne({ email: meEmail }, { $set: { active: true, role: 'admin' } });
        continue;
      }
      await d.collection(c).deleteMany({});
      if (rows.length) await d.collection(c).insertMany(rows as never[]);
    }
    done.push(s.label);
  }
  return { imported: done };
}
