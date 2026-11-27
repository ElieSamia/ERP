import Link from 'next/link';
import { ContactImport } from '@/components/ContactImport';
import { FIELDS } from '@/lib/importer';

export default function ImportContacts() {
  return (
    <>
      <div className="cp"><div className="crumbs"><Link className="crumb" href="/contacts">Contacts</Link><span className="sep">/</span><span>Import</span></div></div>
      <ContactImport fields={FIELDS} />
    </>
  );
}
