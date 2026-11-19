import { db } from './db';
import { DEFAULT_APPEARANCE, DEFAULT_LAYOUTS, type Appearance, type DocKind, type DocLayout } from './constants';

/**
 * The company logo and the layout of each printed document. The logo is kept as a small image in the database
 * (shrunk in the browser before upload), so it prints, shares and works offline without any extra storage.
 */
export type Branding = { logo: string; docs: Record<DocKind, DocLayout> };

export async function getBranding(): Promise<Branding> {
  const d = await (await db()).collection<{ _id: string } & Partial<Branding>>('settings').findOne({ _id: 'branding' }).catch(() => null);
  const docs = Object.fromEntries((Object.keys(DEFAULT_LAYOUTS) as DocKind[]).map((k) => [k, { ...DEFAULT_LAYOUTS[k], ...(d?.docs?.[k] || {}) }])) as Record<DocKind, DocLayout>;
  return { logo: d?.logo || '', docs };
}
export async function layoutFor(kind: DocKind) {
  const b = await getBranding();
  return { ...b.docs[kind], logo: b.logo };
}

export async function getAppearance(): Promise<Appearance> {
  try {
    const d = await (await db()).collection<{ _id: string } & Partial<Appearance>>('settings').findOne({ _id: 'appearance' });
    const { _id, ...rest } = d ?? ({} as { _id: string });
    void _id;
    return { ...DEFAULT_APPEARANCE, ...rest };
  } catch {
    return DEFAULT_APPEARANCE; // before setup, or if the database is unreachable
  }
}
