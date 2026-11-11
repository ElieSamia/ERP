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
