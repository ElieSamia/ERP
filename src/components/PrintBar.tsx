'use client';
import Link from 'next/link';

export function PrintBar({ back, toggle }: { back: string; toggle?: { href: string; label: string } }) {
  return (
    <div className="doc-toolbar noprint">
      <button className="btn primary" onClick={() => window.print()}>Print or save as PDF</button>
      {toggle && <Link className="btn" href={toggle.href}>{toggle.label}</Link>}
      <Link className="btn" href={back}>Back to the booking</Link>
      <span className="muted">To get a PDF, choose Save as PDF in the print dialog.</span>
    </div>
  );
}
