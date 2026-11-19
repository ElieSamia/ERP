'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { useToast } from './Toast';

/** Each person turns two-step sign-in on for their own account, with any authenticator app. */
export function TwoStepPanel({ initial }: { initial: { enabled: boolean; recoveryLeft: number } }) {
  const [st, setSt] = useState<null | { enabled: boolean; recoveryLeft: number }>(initial);
  const [setup, setSetup] = useState<null | { qr: string; secret: string }>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pw, setPw] = useState('');
  const [ask, setAsk] = useState<null | 'disable' | 'new-codes'>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function run(body: Record<string, string>, after: (r: { enabled?: boolean; codes?: string[]; qr?: string; secret?: string }) => void) {
    setBusy(true);
    try { after(await api('/api/account/two-step', 'POST', body)); } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  if (!st) return null;
  return (
    <section className="sheet" style={{ marginBottom: 16 }} id="account">
      <div className="cp" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Your account: two-step sign-in</h2>
        <span className={`badge ${st.enabled ? 'b-green' : ''}`}>{st.enabled ? 'On' : 'Off'}</span></div>
      <p className="hint" style={{ marginTop: 0 }}>After your password, you also enter a 6-digit code from an app on your phone (Google Authenticator, Microsoft Authenticator, 1Password or similar). Someone who learns your password still can’t sign in.</p>
      {codes && (
        <div className="banner" style={{ display: 'block', margin: '10px 0' }}>
          <b>Your recovery codes.</b> Each works once if you lose your phone. Save them somewhere safe now; they won’t be shown again.
          <pre className="rcodes">{codes.join('\n')}</pre>
          <button className="btn" onClick={() => navigator.clipboard.writeText(codes.join('\n')).then(() => toast('Copied.'))}>Copy</button>{' '}
          <button className="btn" onClick={() => setCodes(null)}>I’ve saved them</button>
        </div>
      )}
      {!st.enabled && !setup && <button className="btn primary" disabled={busy} onClick={() => run({ action: 'start' }, (r) => setSetup({ qr: r.qr!, secret: r.secret! }))}>Turn on two-step sign-in</button>}
      {setup && (
        <div className="twostep">
          {/* The QR code is drawn on our own server, so the secret never leaves the ERP. */}
          <div className="qr" dangerouslySetInnerHTML={{ __html: setup.qr }} />
          <div>
            <ol style={{ marginTop: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Open your authenticator app and add an account by scanning this code.</li>
              <li>Can’t scan? Enter this key instead: <code className="key">{setup.secret}</code></li>
              <li>Type the 6-digit code the app shows:</li>
            </ol>
            <div className="addrow" style={{ marginTop: 0 }}>
              <label className="sr" htmlFor="ts-code">Code from the app</label>
              <input id="ts-code" className="sel" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123 456" />
              <button className="btn primary" disabled={busy} onClick={() => run({ action: 'confirm', code }, (r) => { setSt({ enabled: true, recoveryLeft: 10 }); setSetup(null); setCode(''); setCodes(r.codes ?? null); toast('Two-step sign-in is on.'); })}>Confirm and turn on</button>
              <button className="btn" onClick={() => { setSetup(null); setCode(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {st.enabled && !ask && (
        <div className="addrow" style={{ marginTop: 0 }}>
          <span className="muted" style={{ alignSelf: 'center' }}>{st.recoveryLeft} recovery code{st.recoveryLeft === 1 ? '' : 's'} left.</span>
          <button className="btn" onClick={() => setAsk('new-codes')}>New recovery codes</button>
          <button className="btn ghost" onClick={() => setAsk('disable')}>Turn off</button>
        </div>
      )}
      {ask && (
        <div className="addrow" style={{ marginTop: 0 }}>
          <label className="sr" htmlFor="ts-pw">Your password</label>
          <input id="ts-pw" className="sel" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Your password, to confirm" />
          <button className="btn primary" disabled={busy || !pw} onClick={() => run({ action: ask, password: pw }, (r) => {
            setPw(''); setAsk(null);
            if (ask === 'disable') { setSt({ enabled: false, recoveryLeft: 0 }); toast('Two-step sign-in is off.'); } else { setCodes(r.codes ?? null); setSt({ enabled: true, recoveryLeft: 10 }); }
          })}>{ask === 'disable' ? 'Turn off' : 'Make new codes'}</button>
          <button className="btn" onClick={() => { setAsk(null); setPw(''); }}>Cancel</button>
        </div>
      )}
    </section>
  );
}
