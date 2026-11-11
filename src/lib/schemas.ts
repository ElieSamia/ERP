import { z } from 'zod';

const text = z.string().trim().default('');

export const contactSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.'),
  type: z.enum(['customer', 'agency', 'corporate', 'supplier']),
  email: z.union([z.literal(''), z.string().trim().toLowerCase().email('Enter a valid email address.')]).default(''),
  phone: text,
  city: text,
  country: text,
  creditLimit: z.coerce.number().min(0, 'The credit limit can’t be negative.').default(0),
  marketing: z.enum(['yes', 'no']).default('yes'),
  portalAccess: z.enum(['yes', 'no']).default('no'),
  notes: text,
});

export const quickContactSchema = contactSchema.pick({ name: true, type: true, email: true, phone: true, city: true }).extend({
  country: text.default('Lebanon'),
});

export const leadSchema = z.object({
  title: z.string().trim().min(1, 'Give the opportunity a title.'),
  contactId: z.string().min(1, 'Choose or create a customer.'),
  stage: z.enum(['new', 'qualified', 'quoted', 'won', 'lost']).default('new'),
  destination: text,
  travelDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.')]).default(''),
  pax: z.coerce.number().int().min(0).default(1),
  budget: z.coerce.number().min(0, 'The budget can’t be negative.').default(0),
  notes: text,
});

export const companySchema = z.object({
  name: z.string().trim().min(1, 'Enter the company name.'),
  address: text,
  phone: text,
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address.')]).default(''),
  financialNo: text,
  vatNo: text,
  commercialReg: text,
});

export const newUserSchema = z.object({
  name: z.string().trim().min(1, 'Enter the person’s name.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  role: z.enum(['admin', 'staff']),
  password: z.string().min(10, 'Use a temporary password of at least 10 characters.'),
});

/* ---------- Bookings ---------- */
const dateOrEmpty = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.')]).default('');
const code = z.string().trim().toUpperCase().max(3, 'Airport codes have 3 letters.').default('');

export const bookingLineSchema = z.object({
  id: z.string().min(1).max(60),
  type: z.enum(['flight', 'hotel', 'transfer', 'visa', 'package', 'insurance', 'other']),
  desc: z.string().trim().max(500).default(''),
  date: dateOrEmpty,
  dateTo: dateOrEmpty,
  supplierId: z.string().default(''),
  cost: z.coerce.number().min(0, 'Costs can’t be negative.'),
  markup: z.coerce.number().min(0, 'Markups can’t be negative.').max(1000),
});

export const bookingSchema = z.object({
  contactId: z.string().min(1, 'Choose or create a customer.'),
  tripType: z.enum(['return', 'oneway', 'service']).default('return'),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Set the booking date.'),
  origin: code,
  destination: code,
  destinationName: text,
  departDate: dateOrEmpty,
  returnDate: dateOrEmpty,
  travellers: z.string().max(4000).default(''),
  tripNotes: z.string().max(8000).default(''),
  notes: z.string().max(8000).default(''),
  lines: z.array(bookingLineSchema).max(100, 'A booking can have up to 100 services.').default([]),
});

export const pricingSchema = z.object({
  B2C: z.coerce.number().min(0).max(1000),
  B2B: z.coerce.number().min(0).max(1000),
  Corporate: z.coerce.number().min(0).max(1000),
});
