import { MongoClient, type Db } from 'mongodb';

declare global {
  // Reused across hot reloads in development and across invocations of a warm serverless function.
  // eslint-disable-next-line no-var
  var _mongoClient: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var _mongoIndexes: Promise<void> | undefined;
}

function getClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set. Add it in Vercel, Settings, Environment Variables.');
  if (!global._mongoClient) {
    global._mongoClient = new MongoClient(uri, { appName: 'travel-erp', maxIdleTimeMS: 5000 }).connect();
  }
  return global._mongoClient;
}

/** Indexes are created once per server start, so new phases get theirs without a manual step. */
async function ensureIndexes(d: Db) {
  await Promise.all([
    d.collection('users').createIndex({ email: 1 }, { unique: true }),
    d.collection('contacts').createIndex({ name: 1 }),
    d.collection('contacts').createIndex({ type: 1 }),
    d.collection('leads').createIndex({ stage: 1 }),
    d.collection('leads').createIndex({ contactId: 1 }),
    d.collection('activity').createIndex({ model: 1, recordId: 1, at: -1 }),
    d.collection('bookings').createIndex({ ref: 1 }, { unique: true }),
    d.collection('bookings').createIndex({ contactId: 1, status: 1 }),
    d.collection('bookings').createIndex({ status: 1, createdAt: -1 }),
    d.collection('invoices').createIndex({ contactId: 1, status: 1 }),
    d.collection('invoices').createIndex({ bookingId: 1 }),
    d.collection('invoices').createIndex({ number: 1 }, { unique: true, partialFilterExpression: { number: { $type: 'string' } } }),
    d.collection('purchases').createIndex({ ref: 1 }, { unique: true }),
    d.collection('purchases').createIndex({ bookingId: 1 }),
    d.collection('purchases').createIndex({ supplierId: 1, status: 1 }),
    d.collection('expenses').createIndex({ date: -1 }),
    // Share links delete themselves once they expire.
    d.collection('shares').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

export async function db(): Promise<Db> {
  const client = await getClient();
  const d = client.db(process.env.MONGODB_DB || 'travel_erp');
  if (!global._mongoIndexes) {
    global._mongoIndexes = ensureIndexes(d).catch((e) => {
      console.error('Index creation failed', e);
      global._mongoIndexes = undefined;
    });
  }
  return d;
}
