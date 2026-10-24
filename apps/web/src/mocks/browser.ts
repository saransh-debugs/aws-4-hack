/**
 * Opt-in browser API mocking: `VITE_DATA_MODE=live VITE_API_MOCKING=msw npm run dev` serves the
 * docs/CONTRACTS.md API from a service worker, so live mode works with no backend.
 * Loaded with a dynamic import, so MSW is not in the production bundle unless enabled.
 */
export async function startApiMocking(): Promise<void> {
  if (import.meta.env.VITE_API_MOCKING !== 'msw') return;
  const [{ setupWorker }, { createHandlers }, { apiBaseUrl }] = await Promise.all([
    import('msw/browser'),
    import('./handlers'),
    import('../data/selectAdapter'),
  ]);
  const base = new URL(apiBaseUrl(), window.location.origin).toString();
  await setupWorker(...createHandlers(base)).start({ onUnhandledRequest: 'bypass' });
}
