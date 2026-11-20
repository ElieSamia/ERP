import type { Metadata } from 'next';
import { getEnquirySettings, TYPES } from '@/lib/enquiry';
import { getCompany } from '@/lib/queries';
import { EnquiryForm } from '@/components/EnquiryForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Travel enquiry', robots: { index: false } };

/** Public enquiry page: link to it from your website, social media or WhatsApp status, or embed it in an iframe. */
export default async function EnquirePage() {
  const [s, c] = await Promise.all([getEnquirySettings(), getCompany()]);
  return (
    <main className="enq-page">
      <h1>{c.name ? `Plan your trip with ${c.name}` : 'Plan your trip'}</h1>
      {s.enabled ? <><p className="muted">Tell us what you have in mind and we’ll come back to you with options.</p><EnquiryForm siteKey={s.siteKey} types={TYPES} /></>
        : <p className="muted">Online enquiries aren’t open at the moment. Please contact us{c.phone ? ` on ${c.phone}` : ''}{c.email ? ` or at ${c.email}` : ''}.</p>}
    </main>
  );
}
