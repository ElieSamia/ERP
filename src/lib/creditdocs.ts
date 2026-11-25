import { getInvoice, getPurchase } from './finance';
export const getCustomerDoc = (id: string) => getInvoice(id);
export const getSupplierDoc = (id: string) => getPurchase(id);
