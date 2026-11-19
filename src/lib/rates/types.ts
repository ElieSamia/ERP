/**
 * The standard shape every rates provider follows: search, re-check a price, reserve, cancel. A new provider
 * (a GDS, a consolidator, a bedbank, an insurer, a transfer company) is one file implementing `Connector`;
 * the Rates desk, bookings, invoices and accounting don't change.
 */
export type RateKind = 'flight' | 'hotel' | 'transfer' | 'insurance';
export const RATE_KINDS: [RateKind, string][] = [['flight', 'Flights'], ['hotel', 'Hotels'], ['transfer', 'Transfers'], ['insurance', 'Insurance']];

export type FlightQuery = { origin: string; destination: string; depart: string; ret: string; adults: number; children: number; cabin: 'economy' | 'business' };
export type HotelQuery = { destination: string; checkIn: string; checkOut: string; rooms: number; adults: number; children: number };
export type TransferQuery = { from: string; to: string; date: string; time: string; passengers: number };
export type InsuranceQuery = { destination: string; start: string; end: string; travellers: number };
export type Query = { kind: 'flight'; q: FlightQuery } | { kind: 'hotel'; q: HotelQuery } | { kind: 'transfer'; q: TransferQuery } | { kind: 'insurance'; q: InsuranceQuery };

/** One result, as every provider must return it. Amounts are the provider's cost to you, in `currency`. */
export type Offer = {
  id: string;            // the provider's own offer id, opaque to the ERP
  kind: RateKind;
  title: string;         // e.g. "Middle East Airlines, BEY to DXB"
  lines: string[];       // the details shown on the result and copied to the booking
  date: string; dateTo: string;
  amount: number; currency: string;
  refundable: boolean;
  cancelDeadline?: string; // last free-cancellation date (ISO date)
  timeLimit?: string;      // e.g. ticketing time limit for held flights (ISO date)
  tags?: string[];         // e.g. "Direct", "Breakfast", "4 stars"
};
export type Traveller = { name: string };
export type Reservation = { providerRef: string; status: 'confirmed' | 'held'; timeLimit?: string; note?: string };

export type Connector = {
  search(query: Query): Promise<Offer[]>;
  /** Asks the provider for the current price; returns null when no longer available. */
  recheck(offer: Offer): Promise<{ amount: number; currency: string } | null>;
  reserve(offer: Offer, travellers: Traveller[], reference: string): Promise<Reservation>;
  cancel(providerRef: string, offer: Offer): Promise<{ fee: number; currency: string }>;
  /** A quick call proving the credentials work; returns a short description. */
  check(): Promise<string>;
};

/** How a provider describes itself in Settings: what it sells and which credentials it needs. */
export type ProviderMeta = {
  id: string; name: string; kinds: RateKind[]; description: string;
  fields: { key: string; label: string; secret?: boolean; placeholder?: string }[];
  create(credentials: Record<string, string>, mode: 'test' | 'live'): Connector;
};
