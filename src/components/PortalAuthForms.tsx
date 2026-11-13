'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as { error?: string }).error || 'Something went wrong. Try again.');
}

export function PortalLoginForm({ company }: { company: string }) {
  const params = useSearchParams();
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await post('/api/portal/auth/login', f); const n = params.get('next'); window.location.href = n && n.startsWith('/portal') ? n : '/portal'; }
    catch (x) { setErr((x as Error).message); setBusy(false); }
  }
  return (
    <div className="auth"><div className="auth-card">
      <h1>{company} portal</h1>
      <p>Sign in to send requests and follow your bookings, invoices and statement.</p>
      <form onSubmit={submit}>
        {err && <p className="form-error" role="alert">{err}</p>}
        <label className="fld" htmlFor="email"><span>Email</span><input id="email" type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></label>
        <label className="fld" htmlFor="password"><span>Password</span><input id="password" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></label>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="hint">Forgot your password? Ask your account admin or {company} for a new link.</p>
    </div></div>
  );
}

export function InviteForm({ token, name, company }: { token: string; name: string; company: string }) {
  const [p, setP] = useState({ a: '', b: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    if (p.a.length < 10) return setErr('Use a password of at least 10 characters.');
    if (p.a !== p.b) return setErr('The two passwords don’t match.');
    setBusy(true);
    try { await post('/api/portal/auth/invite', { token, password: p.a }); window.location.href = '/portal'; }
    catch (x) { setErr((x as Error).message); setBusy(false); }
  }
  return (
    <div className="auth"><div className="auth-card">
      <h1>Welcome, {name.split(' ')[0]}</h1>
      <p>Choose a password for the {company} portal. You’ll use it with your email to sign in.</p>
      <form onSubmit={submit}>
        {err && <p className="form-error" role="alert">{err}</p>}
        <label className="fld" htmlFor="p1"><span>Password, at least 10 characters</span><input id="p1" type="password" autoComplete="new-password" value={p.a} onChange={(e) => setP({ ...p, a: e.target.value })} required /></label>
        <label className="fld" htmlFor="p2"><span>Type it again</span><input id="p2" type="password" autoComplete="new-password" value={p.b} onChange={(e) => setP({ ...p, b: e.target.value })} required /></label>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Set password and sign in'}</button>
      </form>
    </div></div>
  );
}
