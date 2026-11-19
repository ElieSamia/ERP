import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getAppearance } from '@/lib/branding';
import { PRESETS } from '@/lib/constants';

export const metadata: Metadata = { title: 'Travel ERP', description: 'Travel agency ERP' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

const FONTS = { instrument: '"Instrument Sans"', system: 'system-ui', serif: 'Georgia, "Times New Roman"' };

/** Applies the saved look (colours, light or dark, font, spacing, corners) for everyone, staff and portal. */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const a = await getAppearance();
  const p = PRESETS[a.preset] ?? PRESETS.teal;
  const light = `--accent:${p.light[0]};--accent-soft:${p.light[1]};--bar:${p.light[2]};`;
  const dark = `--accent:${p.dark[0]};--accent-soft:${p.dark[1]};--bar:${p.dark[2]};`;
  const css = `:root{${light}--font:${FONTS[a.font]}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}}}:root[data-theme="dark"]{${dark}}`;
  return (
    <html lang="en" data-theme={a.mode === 'system' ? undefined : a.mode} data-density={a.density} data-corners={a.corners}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
