import { db } from './db';

export type ActivityModel = 'contact' | 'lead' | 'booking' | 'invoice' | 'purchase' | 'expense' | 'move';

/** The chatter: a history of changes and notes for each record, like Odoo. */
export async function logActivity(model: ActivityModel, recordId: string, by: string, text: string) {
  await (await db()).collection('activity').insertOne({ model, recordId, by, text, at: new Date() });
}
