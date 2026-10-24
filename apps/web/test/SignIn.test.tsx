import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignIn } from '../src/components/SignIn';
import { CognitoAuthError, type AuthSession } from '../src/auth/cognito';

afterEach(cleanup);

const SESSION: AuthSession = {
  idToken: 'tok',
  email: 'demo@example.com',
  expiresAt: Date.now() + 3_600_000,
};

describe('SignIn', () => {
  it('signs in and reports the session on success', async () => {
    const user = userEvent.setup();
    const onSignedIn = vi.fn();
    const signInImpl = vi.fn().mockResolvedValue(SESSION);
    render(<SignIn onSignedIn={onSignedIn} signInImpl={signInImpl as never} />);

    await user.type(screen.getByLabelText(/email/i), 'demo@example.com');
    await user.type(screen.getByLabelText(/password/i), 'pw');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(signInImpl).toHaveBeenCalledWith('demo@example.com', 'pw'));
    expect(onSignedIn).toHaveBeenCalledWith(SESSION);
  });

  it('shows an error with role=alert on failure', async () => {
    const user = userEvent.setup();
    const onSignedIn = vi.fn();
    const signInImpl = vi.fn().mockRejectedValue(new CognitoAuthError('Incorrect password.'));
    render(<SignIn onSignedIn={onSignedIn} signInImpl={signInImpl as never} />);

    await user.type(screen.getByLabelText(/email/i), 'demo@example.com');
    await user.type(screen.getByLabelText(/password/i), 'nope');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Incorrect password.');
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});
