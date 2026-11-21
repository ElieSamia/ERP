import { NextResponse } from 'next/server';
import { HttpError } from '@/lib/api';
import { receiveFromSource } from '@/lib/enquiries';

/**
 * Enquiries from your website's server and from partners. Server-to-server: authenticated by the source's key in the
 * Authorization header (Bearer). 201 = created, 200 with duplicate:true = already received. See Settings → Enquiry sources.
 */
export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Send a JSON body with Content-Type: application/json.' }, { status: 400 }); }
  try {
    const r = await receiveFromSource(req.headers.get('authorization'), body);
    return NextResponse.json({ ok: true, duplicate: r.duplicate, opportunityRef: r.ref, opportunityId: r.id }, { status: r.duplicate ? 200 : 201 });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status, headers: e.status === 429 ? { 'Retry-After': '60' } : {} });
    console.error('Enquiry API failed', e);
    return NextResponse.json({ ok: false, error: 'Something went wrong in the ERP. Retry later.' }, { status: 500 });
  }
}
