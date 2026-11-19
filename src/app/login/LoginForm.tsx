'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/client';

export function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [code, setCode] = useState('');
  const go = () => { const next = params.get('next'); window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'; };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api<{ ok?: boolean; twoStep?: boolean }>('/api/auth/login', 'POST', { email, password });
      if (r.twoStep) { setStep('code'); setBusy(false); return; }
      go();
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }
  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await api('/api/auth/two-step', 'POST', { code }); go(); }
    catch (err) { const m = (err as Error).message; setError(m); setBusy(false); if (/Sign in again|too long/.test(m)) { setStep('password'); setCode(''); } }
  }
  if (step === 'code') return (
    <div className="auth">
      <div className="auth-card">
        <h1>Two-step sign-in</h1>
        <p>Enter the 6-digit code from your authenticator app. Lost your phone? Enter one of your recovery codes instead.</p>
        <form onSubmit={submitCode}>
          {error && <p className="form-error" role="alert">{error}</p>}
          <label className="fld" htmlFor="code"><span>Code</span><input id="code" inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="123 456" required /></label>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
          <button className="linkbtn" type="button" style={{ marginTop: 10 }} onClick={() => { setStep('password'); setCode(''); setError(''); }}>Back to email and password</button>
        </form>
      </div>
    </div>
  );
  return (
    <div className="auth">
      <div className="auth-card">
        <h1>Sign in</h1>
        <p>Use the email and password your administrator gave you.</p>
        <form onSubmit={submit}>
          {error && <p className="form-error" role="alert">{error}</p>}
          <label className="fld" htmlFor="email"><span>Email</span><input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label className="fld" htmlFor="password"><span>Password</span><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}
