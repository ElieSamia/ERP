import { getWaSettings } from '@/lib/whatsapp';
import { WhatsAppInbox } from '@/components/WhatsAppInbox';

export default async function WhatsAppPage() {
  const w = await getWaSettings();
  return (
    <>
      <div className="cp"><div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>WhatsApp{w.displayNumber ? ` · ${w.displayNumber}` : ''}</h1></div></div>
      <WhatsAppInbox templates={w.templates.filter((t) => t.status === 'APPROVED')} ready={w.enabled && w.hasToken && !!w.phoneNumberId} />
    </>
  );
}
