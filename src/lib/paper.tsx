import type { Company, Contact } from './types';

/** Shared header and footer for printed documents. */
export function PaperHead({ company, title, number, party, partyLabel, meta, stamp, showTax }: {
  company: Company; title: string; number: string; party?: Contact | null; partyLabel: string; meta: [string, string][]; stamp?: string; showTax?: boolean;
}) {
  const lines = party ? [[party.city, party.country].filter(Boolean).join(', '), party.email, party.phone].filter(Boolean) : [];
  return (
    <>
      <div className="doc-head">
        <div className="co">
          <b>{company.name}</b>
          {company.address && <div style={{ whiteSpace: 'pre-line' }}>{company.address}</div>}
          <div>{[company.phone, company.email].filter(Boolean).join(', ')}</div>
          {showTax && company.financialNo && <div>Financial no. {company.financialNo}</div>}
          {showTax && company.vatNo && <div>VAT no. {company.vatNo}</div>}
        </div>
        <div className="dh-r"><h1>{title}</h1><div className="dnum">{number}</div>{stamp && <div className="stamp">{stamp}</div>}</div>
      </div>
      <div className="two">
        <div><div className="lbl">{partyLabel}</div><b>{party?.name ?? 'To be confirmed'}</b>{lines.map((l) => <div key={l}>{l}</div>)}</div>
        <div className="meta">{meta.map(([k, v]) => <div key={k}><span className="lbl">{k}</span><span>{v}</span></div>)}</div>
      </div>
    </>
  );
}

export function PaperFoot({ company, note, sigs }: { company: Company; note?: string; sigs?: [string, string] }) {
  return (
    <>
      {sigs && <div className="sigs"><div>{sigs[0]}</div><div>{sigs[1]}</div></div>}
      <div className="foot">{note && <p>{note}</p>}{[company.name, company.address.replace(/\n/g, ', '), company.phone].filter(Boolean).join(', ')}</div>
    </>
  );
}
