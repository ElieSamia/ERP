'use client';
import { useEffect } from 'react';

/** Asks before leaving the page while something is chosen but not yet sent, such as a file not uploaded. */
export function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [active]);
}

/** Label for an upload button: names the chosen file so it's clear it hasn't been sent yet. */
export const uploadLabel = (f: File | null, idle: string) => (f ? `Upload ${f.name.length > 28 ? `${f.name.slice(0, 25)}…` : f.name}` : idle);
