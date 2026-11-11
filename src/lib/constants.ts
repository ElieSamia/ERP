// Shared by the server and the browser. No server-only imports here.
export const CONTACT_TYPES = [
  ['customer', 'Individual'],
  ['agency', 'B2B agency'],
  ['corporate', 'Corporate'],
  ['supplier', 'Supplier'],
] as const;
export type ContactType = (typeof CONTACT_TYPES)[number][0];

export const LEAD_STAGES = [
  ['new', 'New'],
  ['qualified', 'Qualified'],
  ['quoted', 'Quote sent'],
  ['won', 'Won'],
  ['lost', 'Lost'],
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number][0];

export const TYPE_BADGE: Record<string, string> = { customer: '', agency: 'b-accent', corporate: 'b-amber', supplier: '' };
export const STAGE_BADGE: Record<string, string> = { new: '', qualified: 'b-accent', quoted: 'b-amber', won: 'b-green', lost: 'b-red' };

export const label = (list: readonly (readonly [string, string])[], key: string) => list.find((x) => x[0] === key)?.[1] ?? key;
export const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
export const fmtDate = (d?: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set';
export const fmtDateTime = (d: string | Date) =>
  new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
