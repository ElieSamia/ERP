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

export type BookingLine = { id: string; type: ServiceType; desc: string; date: string; dateTo: string; supplierId: string; cost: number; markup: number };
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
  createdAt?: string;
};
export type Option = { id: string; name: string };
