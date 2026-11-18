import { notFound } from 'next/navigation';
import { getContact } from '@/lib/queries';
import { ContactForm } from '@/components/ContactForm';
import { db } from '@/lib/db';

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const c = await getContact((await params).id);
  if (!c) notFound();
  const portalUsers = c.portalAccess === 'yes' ? await (await db()).collection('portalUsers').countDocuments({ contactId: c.id, active: { $ne: false } }) : undefined;
  return <ContactForm key={c.id} initial={c} portalUsers={portalUsers} />;
}
