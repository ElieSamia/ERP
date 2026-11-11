'use client';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Kind = '' | 'err';
const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; kind: Kind } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((msg: string, kind: Kind = '') => {
    setT({ msg, kind });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), kind === 'err' ? 5200 : 2800);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div role="status" aria-live="polite">{t && <div className={`toast ${t.kind}`}>{t.msg}</div>}</div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
