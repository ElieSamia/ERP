'use client';
import { useState } from 'react';
import { api } from '@/lib/client';

export function SetupForm() {
  const [f, setF] = useState({ company: '', name: '', email: '', password: '', sample: true });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === 'sample' ? e.target.checked : e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await api('/api/setup', 'POST', f); window.location.href = '/'; }
    catch (err) { setError((err as Error).message); setBusy(false); }
  }
  return (
    <div className="auth">
      <div className="auth-card">
        <h1>Set up your ERP</h1>
        <p>This runs once. It creates your company and the first administrator account.</p>
        <form onSubmit={submit}>
          {error && <p className="form-error" role="alert">{error}</p>}
          <label className="fld" htmlFor="company"><span>Company name</span><input id="company" value={f.company} onChange={set('company')} required /></label>
          <label className="fld" htmlFor="name"><span>Your name</span><input id="name" autoComplete="name" value={f.name} onChange={set('name')} required /></label>
          <label className="fld" htmlFor="email"><span>Your email</span><input id="email" type="email" autoComplete="username" value={f.email} onChange={set('email')} required /></label>
          <label className="fld" htmlFor="password"><span>Password, at least 10 characters</span><input id="password" type="password" autoComplete="new-password" minLength={10} value={f.password} onChange={set('password')} required /></label>
          <label className="chk-row" htmlFor="sample"><input id="sample" type="checkbox" checked={f.sample} onChange={set('sample')} />Add the sample contacts and opportunities, so there’s something to try. You can delete them later.</label>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Setting up…' : 'Create and sign in'}</button>
        </form>
      </div>
    </div>
  );
}
