import type { ContactType, LeadStage } from './constants';

export type Contact = {
  id: string;
  name: string;
  type: ContactType;
  email: string;
  phone: string;
  city: string;
  country: string;
  creditLimit: number;
  marketing: 'yes' | 'no';
  portalAccess: 'yes' | 'no';
  notes: string;
  createdAt?: string;
};

export type Lead = {
  id: string;
  bookingId?: string;
  bookingRef?: string;
  title: string;
  contactId: string;
  contactName?: string;
  stage: LeadStage;
  destination: string;
  travelDate: string;
  pax: number;
  budget: number;
  notes: string;
  createdAt?: string;
};

export type Activity = { id: string; by: string; text: string; at: string };

export type Company = {
  name: string;
  address: string;
  phone: string;
  email: string;
  financialNo: string;
  vatNo: string;
  commercialReg: string;
};

export type StaffUser = { id: string; name: string; email: string; role: 'admin' | 'staff'; active: boolean; lastLogin?: string };

import type { BookingStatus, ServiceType, TripType, ContactType as CT } from './constants';

export type BookingLine = { id: string; type: ServiceType; desc: string; date: string; dateTo: string; supplierId: string; cost: number; markup: number; markupType?: 'percent' | 'amount'; poId?: string };
export type BookingDoc = { id: string; kind: string; traveller: string; name: string; size: number; type: string; at: string; by: string; shared: 'yes' | 'no' };
export type Booking = {
  id: string;
  ref: string;
  contactId: string;
  contactName?: string;
  contactType?: CT;
  tripType: TripType;
  bookingDate: string;
  origin: string;
  destination: string;
  destinationName: string;
  departDate: string;
  returnDate: string;
  travellers: string;
  status: BookingStatus;
  lines: BookingLine[];
  tripNotes: string;
  notes: string;
  docs: BookingDoc[];
  leadId?: string;
  leadTitle?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  purchases?: { id: string; ref: string; status: string }[];
  createdAt?: string;
};
export type Option = { id: string; name: string };

import type { InvoiceStatus, PurchaseStatus, ExpenseStatus } from './constants';

export type TaxLine = { id: string; type: ServiceType; desc: string; amount: number; vat: number };
export type Payment = { id: string; ref: string; date: string; amount: number; method: string; accountId: string; by: string };
export type Invoice = {
  id: string; number: string | null; contactId: string; contactName?: string; bookingId?: string; bookingRef?: string;
  date: string; dueDate: string; status: InvoiceStatus; lines: TaxLine[]; payments: Payment[]; notes: string; createdAt?: string;
};
export type Purchase = {
  id: string; ref: string; supplierId: string; supplierName?: string; bookingId?: string; bookingRef?: string; orderDate: string;
  billRef: string; billDate: string; status: PurchaseStatus; lines: TaxLine[]; payments: Payment[]; notes: string; ack?: string; createdAt?: string;
};
export type Expense = {
  id: string; ref: string; date: string; description: string; categoryId: string; amount: number; vat: number; paidFrom: string;
  supplierId: string; supplierName?: string; reference: string; status: ExpenseStatus; notes: string; createdAt?: string;
};
