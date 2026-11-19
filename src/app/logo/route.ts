import { getBranding } from '@/lib/branding';

/** The company logo as an image, for emails and the portal. Public on purpose: a logo is meant to be seen. */
export async function GET() {
  const { logo } = await getBranding();
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(logo);
  if (!m) return new Response('No logo', { status: 404 });
  return new Response(Buffer.from(m[2], 'base64'), { headers: { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
}
