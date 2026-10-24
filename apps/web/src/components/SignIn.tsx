/**
 * Task 13b – SignIn screen (owner: Bushra). Shown only in live mode when there is no valid
 * token. Labelled email/password fields; a failed sign-in shows an error with role="alert".
 */
import { useId, useState } from 'react';
import { signIn, type AuthSession } from '../auth/cognito';

/** Public demo credentials, baked in at build time so judges can sign in with one click. */
const GUEST_EMAIL = import.meta.env.VITE_GUEST_EMAIL ?? 'demo@example.com';
const GUEST_PASSWORD = import.meta.env.VITE_GUEST_PASSWORD ?? '';

export interface SignInProps {
  onSignedIn: (session: AuthSession) => void;
  /** Injectable for tests. */
  signInImpl?: typeof signIn;
  guestEmail?: string;
  guestPassword?: string;
}

export function SignIn({
  onSignedIn,
  signInImpl = signIn,
  guestEmail = GUEST_EMAIL,
  guestPassword = GUEST_PASSWORD,
}: SignInProps) {
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState(guestEmail);
  const [password, setPassword] = useState(guestPassword);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (withEmail: string, withPassword: string) => {
    setBusy(true);
    setError(null);
    try {
      const session = await signInImpl(withEmail, withPassword);
      onSignedIn(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(email, password);
  };

  return (
    <div className="flex h-full items-center justify-center bg-surface text-ink">
      <form
        onSubmit={(e) => void submit(e)}
        aria-label="Sign in"
        className="w-80 space-y-4 rounded-md border border-slate-700 bg-slate-900 p-6"
      >
        <h1 className="font-mono text-sm tracking-widest">GridRisk • SIGN IN</h1>

        {guestPassword && (
          <div className="space-y-2 rounded border border-sky-500/40 bg-sky-500/5 p-3">
            <p className="font-mono text-[11px] text-slate-300">
              Judges: sign in with the prefilled demo account.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(guestEmail, guestPassword)}
              className="w-full rounded border border-sky-500 bg-sky-600/30 px-3 py-1.5 font-mono text-xs font-semibold text-sky-50 hover:bg-sky-600/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:opacity-50"
            >
              {busy ? 'Signing in…' : 'Sign in as guest'}
            </button>
            <p className="font-mono text-[10px] text-slate-500">
              {guestEmail} · read-only demo account
            </p>
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor={emailId} className="block font-mono text-xs text-slate-300">
            Email
          </label>
          <input
            id={emailId}
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 font-mono text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-400"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor={passwordId} className="block font-mono text-xs text-slate-300">
            Password
          </label>
          <input
            id={passwordId}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 font-mono text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-400"
          />
        </div>

        {error && (
          <p role="alert" className="font-mono text-xs text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded border border-sky-500 bg-sky-600/20 px-3 py-1.5 font-mono text-xs font-semibold text-sky-100 hover:bg-sky-600/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
