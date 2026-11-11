import { MongoClient, type Db } from 'mongodb';

declare global {
  // Reused across hot reloads in development and across invocations of a warm serverless function.
  // eslint-disable-next-line no-var
  var _mongoClient: Promise<MongoClient> | undefined;
}

function getClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set. Add it in Vercel, Settings, Environment Variables.');
  if (!global._mongoClient) {
    global._mongoClient = new MongoClient(uri, { appName: 'travel-erp', maxIdleTimeMS: 5000 }).connect();
  }
  return global._mongoClient;
}

export async function db(): Promise<Db> {
  const client = await getClient();
  return client.db(process.env.MONGODB_DB || 'travel_erp');
}
