import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HttpError } from '@/lib/api';
import { originAllowed, receiveEnquiry } from '@/lib/enquiry';

/**
 * Where website forms send enquiries. Accepts JSON (the ERP's snippet and hosted form) or a normal form post
 * (for example from a WordPress form plugin). Browsers may only call it from the websites listed in Settings.
 */
const cors = (origin: string | null): Record<string, string> => (origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' } : {});

export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin');
  if (!(await originAllowed(origin, new URL(req.url).origin))) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: { ...cors(origin), 'Access-Control-Max-Age': '86400' } });
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  if (!(await originAllowed(origin, new URL(req.url).origin))) return NextResponse.json({ error: 'This website isn’t allowed to send enquiries.' }, { status: 403 });
  const type = req.headers.get('content-type') ?? '';
  let body: Record<string, unknown>;
  try { body = type.includes('application/json') ? await req.json() : Object.fromEntries((await req.formData()).entries()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'Send the form as JSON or a normal form post.' }, { status: 400, headers: cors(origin) }); }
  const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '').split(',')[0].trim() || 'unknown';
  try {
    const r = await receiveEnquiry(body, ip);
    return NextResponse.json({ ok: true, message: r.message }, { headers: cors(origin) });
  } catch (e) {
    const msg = e instanceof ZodError ? e.issues[0]?.message ?? 'Please check the form.' : e instanceof HttpError ? e.message : 'Something went wrong. Please try again or call us.';
    const status = e instanceof ZodError ? 400 : e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error('Enquiry failed', e);
    return NextResponse.json({ error: msg }, { status, headers: cors(origin) });
  }
}
