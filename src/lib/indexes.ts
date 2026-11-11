import { db } from './db';

export async function ensureIndexes() {
  const d = await db();
  await Promise.all([
    d.collection('users').createIndex({ email: 1 }, { unique: true }),
    d.collection('contacts').createIndex({ name: 1 }),
    d.collection('contacts').createIndex({ type: 1 }),
    d.collection('leads').createIndex({ stage: 1 }),
    d.collection('leads').createIndex({ contactId: 1 }),
    d.collection('activity').createIndex({ model: 1, recordId: 1, at: -1 }),
  ]);
}
