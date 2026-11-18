const PATHS: Record<string, string> = {
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  crm: 'M4 5h16l-6 7.5V19l-4 2v-8.5z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
  plane: 'M3 11.5 21 4l-7.5 18-2.5-8zM11 14 21 4',
  doc: 'M6 3h9l4 4v14H6zM9 11h7M9 15h7M9 7h3',
  ledger: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6',
  cart: 'M3 4h2l2.4 11h11L21 7H6.2M9 19.5h.01M17 19.5h.01',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M8 17h2',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 7.5h.01',
  chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3M20 16V6',
  megaphone: 'M4 10v4h3l7 4V6l-7 4zM18 9a3 3 0 0 1 0 6M7 14l1.5 5h2.5L10 14',
};

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
