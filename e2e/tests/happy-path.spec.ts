import { expect, test, type Page } from '@playwright/test';

/**
 * Task 15 – mock-mode demo loop (author: Saransh, reviewer: Darsh).
 *
 *   calm -> Simulate -> alert appears -> check actions -> Approve -> DISPATCHED -> Reset
 *
 * Runs against `VITE_DATA_MODE=mock` (see ../playwright.config.ts): no AWS, no network.
 * Selectors use roles and accessible names only, never CSS classes.
 *
 * The UI contract this file relies on (Bushra, keep these names or tell Saransh):
 *   - h1 "GridRisk • LIVE FEED • SYNTHETIC DATA"
 *   - <aside aria-label="Event feed"> with a list "Events, newest first" (Task 4)
 *   - <aside aria-label="Alerts">
 *   - dev toolbar buttons "Simulate" and "Reset" (Task 2)
 *   - each alert is an <article> named by its title, e.g. "ZONE A ISOLATED: ACTION REQUIRED",
 *     with a status text ("pending" / "DISPATCHED"), one checkbox per action and an
 *     "Approve" button (Task 5)
 *
 * The smoke test runs on every PR. The full loop needs Task 2 (MockAdapter + toolbar) and
 * Task 5 (AlertCard), so it is gated on E2E_UI_READY=1 (the CI job reads the repo variable
 * `vars.E2E_UI_READY`). Flip the variable once AlertCard is on main; no code change needed.
 */
const UI_READY = process.env.E2E_UI_READY === '1';

const CALM_EVENT_COUNT = 3;

const eventItems = (page: Page) =>
  page.getByRole('list', { name: /events, newest first/i }).getByRole('button');
const alertsPanel = (page: Page) => page.getByRole('complementary', { name: /^alerts$/i });
const zoneAAlert = (page: Page) => page.getByRole('article', { name: /zone a isolated/i });

test('smoke: the calm baseline renders offline', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: /gridrisk/i })).toBeVisible();
  await expect(page.getByRole('complementary', { name: /event feed/i })).toBeVisible();
  await expect(eventItems(page)).toHaveCount(CALM_EVENT_COUNT);
  await expect(alertsPanel(page)).toBeVisible();
  await expect(page.getByRole('article', { name: /isolated/i })).toHaveCount(0);
});

test.describe('demo loop', () => {
  test.skip(!UI_READY, 'Needs Task 2 (MockAdapter + toolbar) and Task 5 (AlertCard) on main.');

  test('calm -> simulate -> approve -> dispatched -> reset', async ({ page }) => {
    await page.goto('/');
    await expect(eventItems(page)).toHaveCount(CALM_EVENT_COUNT);
    await expect(zoneAAlert(page)).toHaveCount(0);

    // Simulate: the escalation events arrive and one pending alert appears.
    await page.getByRole('button', { name: /^simulate$/i }).click();
    await expect.poll(() => eventItems(page).count()).toBeGreaterThan(CALM_EVENT_COUNT);
    const alert = zoneAAlert(page);
    await expect(alert).toBeVisible();
    await expect(alert.getByText(/pending/i)).toBeVisible();

    // Check the actions, then approve.
    const actions = alert.getByRole('checkbox');
    expect(await actions.count()).toBeGreaterThan(0);
    for (const box of await actions.all()) await box.check();
    await alert.getByRole('button', { name: /approve/i }).click();

    // Dispatched: the alert flips and can't be approved again.
    await expect(alert.getByText(/dispatched/i).first()).toBeVisible();
    await expect(alert.getByRole('button', { name: /^approve$/i })).toHaveCount(0);

    // Reset: back to the calm baseline.
    await page.getByRole('button', { name: /^reset$/i }).click();
    await expect(eventItems(page)).toHaveCount(CALM_EVENT_COUNT);
    await expect(page.getByRole('article', { name: /isolated/i })).toHaveCount(0);
  });

  // Task 16 (hidden Shift+R reset).
  test('hidden Shift+R reset returns to the calm baseline', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^simulate$/i }).click();
    await expect(zoneAAlert(page)).toBeVisible();
    // Move focus off any form control so the shortcut is not ignored.
    await page.locator('body').click();
    await page.keyboard.press('Shift+R');
    await expect(page.getByRole('article', { name: /isolated/i })).toHaveCount(0);
    await expect(eventItems(page)).toHaveCount(CALM_EVENT_COUNT);
  });
});
