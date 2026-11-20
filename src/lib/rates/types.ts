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
  /** Fare rules and other conditions, as readable lines (refunds, changes, penalties). */
  conditions?: string[];
  /** For flights: the structured details the Rates desk filters and sorts on. */
  flight?: FlightInfo;
  /** Provider-specific details the connector needs later (passenger ids, payment rules), kept with the offer. */
  extra?: Record<string, unknown>;
};
/** One direction of a flight. Times are local at each airport, as airlines publish them (YYYY-MM-DDTHH:MM). */
export type FlightSegment = { flight: string; airline: string; from: string; to: string; departAt: string; arriveAt: string; cabin?: string; aircraft?: string };
export type FlightSlice = { origin: string; destination: string; departAt: string; arriveAt: string; durationMin: number; stops: number; via: string[]; longestLayoverMin: number; segments?: FlightSegment[]; fareBrand?: string };
export type FlightInfo = { airline: string; airlineCode: string; slices: FlightSlice[]; checkedBags: number; emissionsKg?: number };

/** A traveller as providers need them. Airlines want everything; hotels usually just the name. */
export type Traveller = {
  name: string; title?: 'mr' | 'ms' | 'mrs' | 'miss' | 'dr'; givenName?: string; familyName?: string; gender?: 'm' | 'f'; bornOn?: string;
  email?: string; phone?: string; nationality?: string; passport?: { number: string; country: string; expiry: string };
};
/** providerRef is the provider's own id for later calls; reference is what travellers and airlines use (PNR, hotel confirmation). */
export type Reservation = { providerRef: string; reference?: string; status: 'confirmed' | 'held'; timeLimit?: string; note?: string };

export type Connector = {
  search(query: Query): Promise<Offer[]>;
  /** Asks the provider for the current price; returns null when no longer available. */
  recheck(offer: Offer): Promise<{ amount: number; currency: string } | null>;
  reserve(offer: Offer, travellers: Traveller[], reference: string): Promise<Reservation>;
  cancel(providerRef: string, offer: Offer): Promise<{ fee: number; currency: string }>;
  /** Turns a held reservation into a paid, ticketed one (flights held until a time limit). Optional. */
  issue?(providerRef: string, offer: Offer): Promise<Reservation>;
  /** A quick call proving the credentials work; returns a short description. */
  check(): Promise<string>;
};

/** How a provider describes itself in Settings: what it sells and which credentials it needs. */
export type ProviderMeta = {
  id: string; name: string; kinds: RateKind[]; description: string;
  fields: { key: string; label: string; secret?: boolean; placeholder?: string }[];
  create(credentials: Record<string, string>, mode: 'test' | 'live'): Connector;
};
