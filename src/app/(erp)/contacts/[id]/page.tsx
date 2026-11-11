import { notFound } from 'next/navigation';
import { getContact } from '@/lib/queries';
import { ContactForm } from '@/components/ContactForm';

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const c = await getContact((await params).id);
  if (!c) notFound();
  return <ContactForm key={c.id} initial={c} />;
}
