import type { WithId, Document } from 'mongodb';

/** Turns a MongoDB document into plain JSON for the browser: _id becomes id, dates become ISO strings. */
export function out<T>(doc: WithId<Document>): T {
  const { _id, ...rest } = doc;
  const res: Record<string, unknown> = { id: String(_id) };
  for (const [k, v] of Object.entries(rest)) {
    if (v instanceof Date) res[k] = v.toISOString();
    else if (v && typeof v === 'object' && '_bsontype' in v) res[k] = String(v);
    else res[k] = v;
  }
  return res as T;
}
