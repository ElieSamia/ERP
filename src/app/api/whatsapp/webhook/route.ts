import { NextResponse } from 'next/server';
import { checkSignature, handleWebhook, verifyTokenMatches } from '@/lib/whatsapp';

/** Meta checks the webhook address once by asking for the verify token back. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.get('hub.mode') === 'subscribe' && (await verifyTokenMatches(q.get('hub.verify_token')))) return new NextResponse(q.get('hub.challenge') ?? '', { status: 200 });
  return new NextResponse('Forbidden', { status: 403 });
}

/** Replies and delivery receipts. Only messages signed with your Meta app secret are accepted. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await checkSignature(raw, req.headers.get('x-hub-signature-256')))) return new NextResponse('Bad signature', { status: 401 });
  try { await handleWebhook(JSON.parse(raw)); } catch (e) { console.error('WhatsApp webhook', e); }
  return NextResponse.json({ ok: true }); // always 200, or Meta keeps retrying
}
