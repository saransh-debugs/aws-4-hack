import { expect, test } from '@playwright/test';

/**
 * Mock-mode happy path (Task 15): calm -> simulate -> alert -> approve -> dispatched.
 *
 * This drives the UI by role/name, so it stays stable as styling changes. It depends on
 * Bushra's MockAdapter + components (H8, Tasks 2-5). Until those land, the UI is still the
 * M0 shell and these interactions won't exist, so the whole file is skipped by default.
 *
 * Flip the gate by setting E2E_UI_READY=1 (locally or as a CI variable) once the UI is wired.
 * The selectors below are the contract the UI should satisfy; adjust names with Bushra if needed.
 */
const UI_READY = process.env.E2E_UI_READY === '1';

test.describe('mock-mode happy path', () => {
  test.skip(!UI_READY, 'Web UI (H8 MockAdapter + components) not wired yet — see Tasks 2-5.');

  test('calm -> simulate escalation -> approve -> dispatched', async ({ page }) => {
    await page.goto('/');

    // 1. Calm baseline: no active alert card.
    await expect(page.getByRole('heading', { name: /grid ?risk/i })).toBeVisible();
    await expect(page.getByRole('region', { name: /alerts/i })).toBeVisible();
    await expect(page.getByRole('article', { name: /isolated/i })).toHaveCount(0);

    // 2. Simulate the escalation scenario (dev toolbar button).
    await page.getByRole('button', { name: /simulate escalation/i }).click();

    // 3. A pending alert appears.
    const alert = page.getByRole('article', { name: /zone a isolated/i });
    await expect(alert).toBeVisible();
    await expect(alert.getByText(/pending/i)).toBeVisible();

    // 4. Approve: select at least one action, then approve.
    await alert.getByRole('checkbox').first().check();
    await alert.getByRole('button', { name: /approve/i }).click();

    // 5. The alert flips to dispatched.
    await expect(alert.getByText(/dispatched/i)).toBeVisible();
  });

  test('hidden Shift+R reset returns to the calm baseline', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /simulate escalation/i }).click();
    await expect(page.getByRole('article', { name: /zone a isolated/i })).toBeVisible();

    // Task 16: hidden Shift+R reset.
    await page.keyboard.press('Shift+R');
    await expect(page.getByRole('article', { name: /isolated/i })).toHaveCount(0);
  });
});
