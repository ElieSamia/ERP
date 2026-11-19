import type { Document, WithId } from 'mongodb';
import { decrypt, encrypt } from './mail';
import { travList } from './constants';
import type { Traveller } from './rates/types';

/**
 * Traveller details on a booking: what airlines and other providers need beyond the name. Kept per booking,
 * matched to the names in the booking's Travellers box. Passport details are stored encrypted, shown only to
 * staff, and never sent to the customer portal.
 */
export type PaxInput = {
  name: string; title: '' | 'mr' | 'ms' | 'mrs' | 'miss' | 'dr'; givenName: string; familyName: string; gender: '' | 'm' | 'f'; bornOn: string;
  nationality: string; email: string; phone: string; passportNumber: string; passportCountry: string; passportExpiry: string;
};
type Stored = Omit<PaxInput, 'passportNumber' | 'passportCountry' | 'passportExpiry'> & { passportEnc?: string };

export const sealPax = (p: PaxInput): Stored => {
  const { passportNumber, passportCountry, passportExpiry, ...rest } = p;
  return { ...rest, ...(passportNumber ? { passportEnc: encrypt(JSON.stringify({ number: passportNumber, country: passportCountry, expiry: passportExpiry })) } : {}) };
};
export function openPax(s: Stored): PaxInput {
  const pp = s.passportEnc ? (JSON.parse(decrypt(s.passportEnc)) as { number: string; country: string; expiry: string }) : null;
  const blank = { title: '', givenName: '', familyName: '', gender: '', bornOn: '', nationality: '', email: '', phone: '' };
  const { passportEnc, ...rest } = s;
  void passportEnc;
  return { ...blank, ...rest, passportNumber: pp?.number ?? '', passportCountry: pp?.country ?? '', passportExpiry: pp?.expiry ?? '' } as PaxInput;
}
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Details for every name on the booking, empty where nothing has been entered yet. */
export function paxFor(b: WithId<Document>): PaxInput[] {
  const stored = ((b.pax as Stored[]) || []).map(openPax);
  return travList(String(b.travellers || '')).map((name) => {
    const s = stored.find((x) => same(x.name, name));
    if (s) return { ...s, name };
    const [given, ...family] = name.split(' ');
    return { name, title: '', givenName: given ?? '', familyName: family.join(' '), gender: '', bornOn: '', nationality: '', email: '', phone: '', passportNumber: '', passportCountry: '', passportExpiry: '' };
  });
}

/** Travellers in the shape providers take. */
export async function travellerDetails(b: WithId<Document>): Promise<Traveller[]> {
  return paxFor(b).map((p) => ({
    name: p.name, title: p.title || undefined, givenName: p.givenName || undefined, familyName: p.familyName || undefined, gender: p.gender || undefined,
    bornOn: p.bornOn || undefined, email: p.email || undefined, phone: p.phone || undefined, nationality: p.nationality || undefined,
    passport: p.passportNumber ? { number: p.passportNumber, country: p.passportCountry, expiry: p.passportExpiry } : undefined,
  }));
}
