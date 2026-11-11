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
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/api/auth/login', 'POST', { email, password });
      const next = params.get('next');
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }
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
