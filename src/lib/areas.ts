/** The apps a role can open, and their levels. Safe to use in the browser. */
export type Level = 'none' | 'view' | 'edit';
export const AREAS = [
  ['crm', 'CRM'], ['bookings', 'Bookings'], ['rates', 'Rates desk'], ['calendar', 'Calendar'], ['products', 'Products'],
  ['contacts', 'Contacts'], ['invoicing', 'Invoicing'], ['purchasing', 'Purchasing'], ['expenses', 'Expenses'], ['accounting', 'Accounting'],
  ['reports', 'Reports'], ['marketing', 'Marketing'], ['whatsapp', 'WhatsApp'], ['portal', 'B2B portal admin'],
] as const;
export type Area = (typeof AREAS)[number][0];
export type Role = { id: string; name: string; perms: Record<Area, Level>; costs: boolean; builtin?: boolean };

