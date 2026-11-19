import type { Company, Contact } from './types';
import type { DocLayout } from './constants';

type Layout = DocLayout & { logo?: string };
/** The document's accent colour, used by its title and table lines. */
export const paperStyle = (l?: Layout) => (l ? ({ ['--doc' as string]: l.accent } as React.CSSProperties) : undefined);

/** Shared header and footer for printed documents. */
export function PaperHead({ company, title: baseTitle, number, party, partyLabel, meta, stamp, showTax: baseTax, layout }: {
  company: Company; title: string; number: string; party?: Contact | null; partyLabel: string; meta: [string, string][]; stamp?: string; showTax?: boolean; layout?: Layout;
}) {
  // A saved layout overrides the title and the tax lines; without one, documents look as they always did.
  const title = layout?.title || baseTitle;
  const showTax = layout ? layout.showTax : baseTax;
  const logo = layout?.showLogo && layout.logo ? layout.logo : '';
  const lines = party ? [[party.city, party.country].filter(Boolean).join(', '), party.email, party.phone].filter(Boolean) : [];
  return (
    <>
      <div className="doc-head">
        <div className="co">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo} alt={company.name} className="doc-logo" />}
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

export function PaperFoot({ company, note: baseNote, sigs: baseSigs, layout }: { company: Company; note?: string; sigs?: [string, string]; layout?: Layout }) {
  const note = layout ? layout.note : baseNote;
  const sigs: [string, string] | undefined = layout ? (layout.showSigs ? [layout.sig1, layout.sig2] : undefined) : baseSigs;
  return (
    <>
      {layout?.terms && <div className="terms"><div className="lbl">Terms and conditions</div><p>{layout.terms}</p></div>}
      {sigs && <div className="sigs"><div>{sigs[0]}</div><div>{sigs[1]}</div></div>}
      <div className="foot">{note && <p>{note}</p>}{[company.name, company.address.replace(/\n/g, ', '), company.phone].filter(Boolean).join(', ')}</div>
    </>
  );
}
