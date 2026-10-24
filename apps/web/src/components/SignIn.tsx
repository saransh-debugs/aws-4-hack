/**
 * Task 13b – SignIn screen (owner: Bushra). Shown only in live mode when there is no valid
 * token. Labelled email/password fields; a failed sign-in shows an error with role="alert".
 */
import { useId, useState } from 'react';
import { signIn, type AuthSession } from '../auth/cognito';

export interface SignInProps {
  onSignedIn: (session: AuthSession) => void;
  /** Injectable for tests. */
  signInImpl?: typeof signIn;
}

export function SignIn({ onSignedIn, signInImpl = signIn }: SignInProps) {
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await signInImpl(email, password);
      onSignedIn(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-surface text-ink">
      <form
        onSubmit={(e) => void submit(e)}
        aria-label="Sign in"
        className="w-80 space-y-4 rounded-md border border-slate-700 bg-slate-900 p-6"
      >
        <h1 className="font-mono text-sm tracking-widest">GridRisk • SIGN IN</h1>

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
