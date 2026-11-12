import { randomBytes } from 'crypto';
import { db } from './db';
import { SHARE_DAYS, type DocKind } from './constants';

export type Share = {
  _id: string; kind: DocKind; id: string; pid: string | null; prices: boolean; model: string; recordId: string;
  createdAt: Date; createdBy: string; expiresAt: Date; revoked: boolean; views: number; lastViewedAt?: Date;
};
const col = async () => (await db()).collection<Share>('shares');

/** A share link is a random 32-character token: it can't be guessed and opens one document only. */
export async function createShare(s: Pick<Share, 'kind' | 'id' | 'pid' | 'prices' | 'model' | 'recordId' | 'createdBy'>) {
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + SHARE_DAYS * 86400000);
  await (await col()).insertOne({ _id: token, ...s, createdAt: new Date(), expiresAt, revoked: false, views: 0 });
  return { token, expiresAt };
}

export async function findShare(token: string, opts: { includeRevoked?: boolean } = {}) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const s = await (await col()).findOne({ _id: token });
  if (!s || s.expiresAt < new Date() || (s.revoked && !opts.includeRevoked)) return null;
  return s;
}

export async function markViewed(token: string) {
  await (await col()).updateOne({ _id: token }, { $inc: { views: 1 }, $set: { lastViewedAt: new Date() } });
}

export async function revokeShare(token: string) {
  await (await col()).updateOne({ _id: token }, { $set: { revoked: true } });
}
