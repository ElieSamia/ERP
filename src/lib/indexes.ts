import { db } from './db';

/** Kept for the setup route: calling db() creates all indexes once per server start. */
export async function ensureIndexes() {
  await db();
  await global._mongoIndexes;
}
