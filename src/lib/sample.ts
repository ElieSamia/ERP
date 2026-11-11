import { db } from './db';
import { logActivity } from './activity';

/** Optional sample data, the same as the prototype, to try the system before entering real records. */
export async function loadSampleData(by: string) {
  const d = await db();
  const now = new Date();
  const contacts = [
    { name: 'Rami Haddad', type: 'customer', email: 'rami.haddad@example.com', phone: '+961 3 214 556', city: 'Beirut', notes: 'Prefers window seats.' },
    { name: 'Nour Khoury', type: 'customer', email: 'nour.k@example.com', phone: '+961 71 880 120', city: 'Jounieh', marketing: 'no' },
    { name: 'Lara Saab', type: 'customer', email: 'lara.saab@example.com', phone: '+961 76 302 118', city: 'Byblos' },
    { name: 'Cedar Wings Travel', type: 'agency', email: 'ops@cedarwings.example', phone: '+961 6 450 900', city: 'Tripoli', creditLimit: 8000, notes: 'Sub-agent since 2024. Net rates.' },
    { name: 'Olive Coast Tours', type: 'agency', email: 'book@olivecoast.example', phone: '+961 7 733 410', city: 'Saida', creditLimit: 3000 },
    { name: 'Mansour Engineering SAL', type: 'corporate', email: 'travel@mansour-eng.example', phone: '+961 1 998 300', city: 'Beirut', creditLimit: 15000, notes: '30-day payment terms.' },
    { name: 'Aerolink Airways', type: 'supplier', email: 'sales@aerolink.example', phone: '+961 1 600 600', city: 'Beirut' },
    { name: 'Globe Hotels Wholesale', type: 'supplier', email: 'contracts@globehotels.example', phone: '+90 212 555 0100', city: 'Istanbul', country: 'Türkiye' },
    { name: 'City Transfers Beirut', type: 'supplier', email: 'dispatch@citytransfers.example', phone: '+961 3 777 210', city: 'Beirut' },
    { name: 'Visa Desk Services', type: 'supplier', email: 'help@visadesk.example', phone: '+961 1 330 440', city: 'Beirut' },
  ].map((c) => ({ country: 'Lebanon', creditLimit: 0, marketing: 'yes', portalAccess: 'no', notes: '', ...c, createdAt: now, createdBy: by }));
  const res = await d.collection('contacts').insertMany(contacts);
  const idOf = (name: string) => String(res.insertedIds[contacts.findIndex((c) => c.name === name)]);
  for (const [i, id] of Object.entries(res.insertedIds)) await logActivity('contact', String(id), by, 'Created with the sample data.').catch(() => i);

  const leads = [
    { title: 'Honeymoon in Santorini', contact: 'Lara Saab', stage: 'qualified', destination: 'Santorini', travelDate: '2027-05-14', pax: 2, budget: 4500, notes: 'Wants a sunset-view hotel.' },
    { title: 'Team offsite in Dubai', contact: 'Mansour Engineering SAL', stage: 'quoted', destination: 'Dubai', travelDate: '2027-01-20', pax: 12, budget: 18000, notes: 'Needs a meeting room for 2 days.' },
    { title: 'Family trip to Rome', contact: 'Nour Khoury', stage: 'new', destination: 'Rome', travelDate: '2027-04-02', pax: 4, budget: 6000, notes: '' },
    { title: 'Ski week in Gudauri', contact: 'Cedar Wings Travel', stage: 'new', destination: 'Gudauri', travelDate: '2027-02-10', pax: 8, budget: 9600, notes: 'Group request from sub-agent.' },
  ].map(({ contact, ...l }) => ({ ...l, contactId: idOf(contact), createdAt: now, createdBy: by }));
  const lr = await d.collection('leads').insertMany(leads);
  for (const id of Object.values(lr.insertedIds)) await logActivity('lead', String(id), by, 'Created with the sample data.');
}
