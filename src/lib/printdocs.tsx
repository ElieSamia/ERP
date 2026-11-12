import type { ReactNode } from 'react';
import { ObjectId } from 'mongodb';
import { getBooking } from './bookings';
import { getFinance, getInvoice, getPurchase } from './finance';
import { getCompany, getContact } from './queries';
import {
  PAY_METHODS, SERVICE_TYPES, type DocKind, docTotals, fmtDate, fmtRange, label, money, nights, r2, sell, totals, travList, travelDates,
} from './constants';
import { PaperHead, PaperFoot } from './paper';
import type { Contact } from './types';

/** Every printable document, used by the staff print pages and by public share links. */
export type { DocKind };
export const DOC_KIND_NAMES: Record<DocKind, string> = {
  confirm: 'booking confirmation', vouchers: 'hotel vouchers', invoice: 'invoice', receipt: 'payment receipt', po: 'purchase order', voucher: 'payment voucher',
};
export type LoadedDoc = {
  title: string; number: string; party: Contact | null; model: 'booking' | 'invoice' | 'purchase'; recordId: string;
  back: string; backLabel: string; node: ReactNode;
};

export async function loadDoc(kind: DocKind, id: string, pid?: string, opts: { prices?: boolean } = {}): Promise<LoadedDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  const company = await getCompany();

  if (kind === 'confirm' || kind === 'vouchers') {
    const b = await getBooking(id);
    if (!b) return null;
    const contact = await getContact(b.contactId);
    const stamp = b.status === 'draft' ? 'Draft, not confirmed' : b.status === 'cancelled' ? 'Cancelled' : undefined;
    const trav = travList(b.travellers);
    const travNode = <p>{trav.length ? trav.map((t) => <span key={t}>{t}<br /></span>) : 'To be confirmed'}</p>;
    const base = { party: contact, model: 'booking' as const, recordId: b.id, back: `/bookings/${b.id}`, backLabel: 'Back to the booking' };
    if (kind === 'confirm') {
      const prices = !!opts.prices;
      const meta: [string, string][] = [['Booking date', fmtDate(b.bookingDate)], ['Travel dates', travelDates(b)]];
      if (b.tripType !== 'service') meta.push(['Route', `${b.origin} to ${b.destination}${b.tripType === 'oneway' ? ', one way' : ''}`]);
      if (b.destinationName) meta.push(['Destination', b.destinationName]);
      return {
        ...base, title: 'Booking confirmation', number: b.ref,
        node: (
          <article className="paper">
            <PaperHead company={company} title="Booking confirmation" number={b.ref} party={contact} partyLabel="Customer" meta={meta} stamp={stamp} />
            <h3>Travellers</h3>{travNode}
            <table>
              <thead><tr><th>Service</th><th>Details</th><th>Dates</th>{prices && <th className="r">Price</th>}</tr></thead>
              <tbody>{b.lines.map((l) => <tr key={l.id}><td>{label(SERVICE_TYPES, l.type)}</td><td>{l.desc}</td><td>{fmtRange(l.date, l.dateTo)}</td>{prices && <td className="r">{money(sell(l))}</td>}</tr>)}</tbody>
            </table>
            {prices && <div className="tot"><div className="g"><span>Total</span><span>{money(totals(b.lines).total)}</span></div></div>}
            {b.tripNotes && <><h3>Important information</h3><p className="pre">{b.tripNotes}</p></>}
            <PaperFoot company={company} note="Please check names and dates against passports and tell us about any difference right away." />
          </article>
        ),
      };
    }
    const hotels = b.lines.filter((l) => l.type === 'hotel' || l.type === 'package');
    const providers = await Promise.all(hotels.map((l) => (ObjectId.isValid(l.supplierId) ? getContact(l.supplierId) : Promise.resolve(null))));
    return {
      ...base, title: 'Hotel vouchers', number: b.ref,
      node: (
        <article className="paper">
          {hotels.length === 0 && <p>This booking has no hotel or package services, so there is no voucher to print.</p>}
          {hotels.map((l, i) => (
            <section key={l.id} className="vpage">
              <PaperHead company={company} title="Hotel voucher" number={`${b.ref}/${i + 1}`} party={providers[i]} partyLabel="Service provider" stamp={stamp}
                meta={[['Booking', b.ref], ['Check-in', l.date ? fmtDate(l.date) : 'To be confirmed'], ['Check-out', l.dateTo ? fmtDate(l.dateTo) : 'To be confirmed'], ['Nights', String(nights(l.date, l.dateTo) || '')]]} />
              <h3>Guests</h3>{travNode}
              <h3>Accommodation and services</h3><p className="pre">{l.desc}</p>
              <p className="small">Booked for {b.contactName}.</p>
              <PaperFoot company={company} note="Please present this voucher at check-in. Extras not listed are payable directly to the hotel." sigs={['Issued by', 'Hotel stamp']} />
            </section>
          ))}
        </article>
      ),
    };
  }

  if (kind === 'invoice' || kind === 'receipt') {
    const inv = await getInvoice(id);
    if (!inv) return null;
    const contact = await getContact(inv.contactId);
    const base = { party: contact, model: 'invoice' as const, recordId: inv.id, back: `/invoicing/${inv.id}`, backLabel: 'Back to the invoice' };
    if (kind === 'invoice') {
      const t = docTotals(inv.lines, inv.payments);
      const stamp = inv.status === 'draft' ? 'Draft' : inv.status === 'paid' ? 'Paid' : undefined;
      return {
        ...base, title: 'Invoice', number: inv.number ?? 'Draft',
        node: (
          <article className="paper">
            <PaperHead company={company} title="Invoice" number={inv.number ?? 'Draft'} party={contact} partyLabel="Bill to" showTax stamp={stamp}
              meta={[['Invoice date', fmtDate(inv.date)], ['Due date', fmtDate(inv.dueDate)], ['Booking', inv.bookingRef ?? '']]} />
            <table>
              <thead><tr><th>Description</th><th>VAT</th><th className="r">Amount</th><th className="r">VAT amount</th></tr></thead>
              <tbody>{inv.lines.map((l) => <tr key={l.id}><td>{l.desc}</td><td>{l.vat}%</td><td className="r">{money(l.amount)}</td><td className="r">{money(r2(l.amount * l.vat / 100))}</td></tr>)}</tbody>
            </table>
            <div className="tot">
              <div><span>Untaxed amount</span><span>{money(t.untaxed)}</span></div>
              <div><span>VAT</span><span>{money(t.vat)}</span></div>
              <div className="g"><span>Total</span><span>{money(t.total)}</span></div>
              {t.paid > 0 && <><div><span>Paid</span><span>{money(t.paid)}</span></div><div><span><b>Balance due</b></span><span><b>{money(t.balance)}</b></span></div></>}
            </div>
            {inv.notes && <p className="pre">{inv.notes}</p>}
            <PaperFoot company={company} note="Thank you for travelling with us." />
          </article>
        ),
      };
    }
    const idx = inv.payments.findIndex((p) => p.id === pid);
    if (idx < 0) return null;
    const p = inv.payments[idx];
    const fin = await getFinance();
    return {
      ...base, title: 'Payment receipt', number: p.ref,
      node: (
        <article className="paper">
          <PaperHead company={company} title="Payment receipt" number={p.ref} party={contact} partyLabel="Received from" showTax
            meta={[['Date', fmtDate(p.date)], ['Method', label(PAY_METHODS, p.method)], ['Received into', fin.accounts.find((a) => a.id === p.accountId)?.name ?? '']]} />
          <div className="amountbox"><span className="lbl">Amount received</span><div className="big">{money(p.amount)}</div></div>
          <table><tbody>
            <tr><td>For invoice</td><td className="r">{inv.number}</td></tr>
            <tr><td>Invoice total</td><td className="r">{money(docTotals(inv.lines).total)}</td></tr>
            <tr><td>Balance after this payment</td><td className="r"><b>{money(docTotals(inv.lines, inv.payments.slice(0, idx + 1)).balance)}</b></td></tr>
          </tbody></table>
          <PaperFoot company={company} note="Thank you for your payment." sigs={['Received by', 'Customer']} />
        </article>
      ),
    };
  }

  const po = await getPurchase(id);
  if (!po) return null;
  const supplier = await getContact(po.supplierId);
  const base = { party: supplier, model: 'purchase' as const, recordId: po.id, back: `/purchasing/${po.id}`, backLabel: 'Back to the order' };
  if (kind === 'po') {
    const booking = po.bookingId ? await getBooking(po.bookingId) : null;
    const t = docTotals(po.lines);
    const stamp = po.status === 'draft' ? 'Request for quotation' : po.status === 'cancelled' ? 'Cancelled' : undefined;
    const trav = booking ? travList(booking.travellers) : [];
    return {
      ...base, title: 'Purchase order', number: po.ref,
      node: (
        <article className="paper">
          <PaperHead company={company} title="Purchase order" number={po.ref} party={supplier} partyLabel="Supplier" showTax stamp={stamp}
            meta={[['Order date', fmtDate(po.orderDate)], ['Our reference', booking?.ref ?? ''], ['Travel dates', booking ? travelDates(booking) : '']]} />
          {trav.length > 0 && <><h3>Travellers</h3><p>{trav.map((x) => <span key={x}>{x}<br /></span>)}</p></>}
          <table>
            <thead><tr><th>Service</th><th>Description</th><th>VAT</th><th className="r">Amount</th></tr></thead>
            <tbody>{po.lines.map((l) => <tr key={l.id}><td>{label(SERVICE_TYPES, l.type)}</td><td>{l.desc}</td><td>{l.vat}%</td><td className="r">{money(l.amount)}</td></tr>)}</tbody>
          </table>
          <div className="tot"><div><span>Untaxed amount</span><span>{money(t.untaxed)}</span></div><div><span>VAT</span><span>{money(t.vat)}</span></div><div className="g"><span>Total</span><span>{money(t.total)}</span></div></div>
          {po.notes && <p className="pre">{po.notes}</p>}
          <PaperFoot company={company} note="Please quote the purchase order number on your invoice." sigs={['Authorised by', 'Accepted by supplier']} />
        </article>
      ),
    };
  }
  const idx = po.payments.findIndex((p) => p.id === pid);
  if (idx < 0) return null;
  const x = po.payments[idx];
  const fin = await getFinance();
  return {
    ...base, title: 'Payment voucher', number: x.ref,
    node: (
      <article className="paper">
        <PaperHead company={company} title="Payment voucher" number={x.ref} party={supplier} partyLabel="Paid to"
          meta={[['Date', fmtDate(x.date)], ['Method', label(PAY_METHODS, x.method)], ['Paid from', fin.accounts.find((a) => a.id === x.accountId)?.name ?? ''], ['Supplier bill', po.billRef]]} />
        <div className="amountbox"><span className="lbl">Amount paid</span><div className="big">{money(x.amount)}</div></div>
        <table><tbody>
          <tr><td>For purchase order</td><td className="r">{po.ref}</td></tr>
          <tr><td>Bill total</td><td className="r">{money(docTotals(po.lines).total)}</td></tr>
          <tr><td>Still owed after this payment</td><td className="r"><b>{money(docTotals(po.lines, po.payments.slice(0, idx + 1)).balance)}</b></td></tr>
        </tbody></table>
        <PaperFoot company={company} sigs={['Prepared by', 'Received by supplier']} />
      </article>
    ),
  };
}
