import { handle, requireUser } from '@/lib/api';
import { listBackups, makeBackup } from '@/lib/backup';

export const maxDuration = 60;

export async function GET() {
  return handle(async () => {
    await requireUser('admin');
    const list = await listBackups();
    const lastDaily = list.find((b) => b.kind === 'daily');
    return { backups: list, scheduled: !!process.env.CRON_SECRET, lastDaily: lastDaily?.at ?? '' };
  });
}
/** Back up now. */
export async function POST() {
  return handle(async () => { const user = await requireUser('admin'); return makeBackup('manual', user.name); });
}
