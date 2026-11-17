import { calendarEvents } from '@/lib/calendar';
import { addDays, todayISO } from '@/lib/constants';
import { CalendarView } from '@/components/CalendarView';

/** Weeks start on Monday; the grid shows whole weeks around the month. */
function grid(month: string) {
  const first = `${month}-01`;
  const dow = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const start = addDays(first, -dow);
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const end = addDays(last, 6 - ((new Date(last + 'T00:00:00Z').getUTCDay() + 6) % 7));
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; view?: string }> }) {
  const sp = await searchParams;
  const today = todayISO();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? '') ? sp.m! : today.slice(0, 7);
  const days = grid(month);
  const events = await calendarEvents(days[0], days.at(-1)!);
  return (
    <>
      <div className="cp"><div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Calendar</h1></div></div>
      <CalendarView month={month} days={days} events={events} today={today} view={sp.view === 'list' ? 'list' : 'month'} />
      <p className="hint">Built from your records, so it’s always current: trips and services from bookings, payment due dates from invoices and supplier bills, travel dates of open opportunities, portal quotes about to expire, and your team’s reminders.</p>
    </>
  );
}
