import { audit } from '@/lib/audit';
import { handle } from '@/lib/api';
import { destroySession } from '@/lib/auth';

export async function POST() {
  return handle(async () => {
    const s = await (await import('@/lib/auth')).getSession();
    if (s) await audit({ kind: 'sign-in', action: 'Signed out', who: s.name, whoId: s.sub });
    await destroySession();
    return { ok: true };
  });
}
