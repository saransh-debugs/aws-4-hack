import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AlertCardData } from '@gridrisk/shared';
import { SAMPLE_ALERT } from '@gridrisk/shared/fixtures';
import { AlertCard, dispatchToastMessage } from '../src/components/AlertCard';
import { AdapterProvider } from '../src/data/AdapterContext';
import { DataAdapterError } from '../src/data/errors';
import type { DataAdapter } from '../src/data/DataAdapter';

afterEach(cleanup);

function stubAdapter(overrides: Partial<DataAdapter> = {}): DataAdapter {
  return {
    getEvents: vi.fn().mockResolvedValue([]),
    getAlerts: vi.fn().mockResolvedValue([]),
    approve: vi.fn(),
    simulate: vi.fn().mockResolvedValue([]),
    reset: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderCard(alert: AlertCardData, adapter: DataAdapter, onApproved = vi.fn()) {
  // A fixed clock so the countdown is deterministic and does not tick during the test.
  const clock = () => Date.parse(alert.createdAt);
  return render(
    <AdapterProvider value={adapter}>
      <AlertCard alert={alert} onApproved={onApproved} clock={clock} />
    </AdapterProvider>,
  );
}

describe('dispatchToastMessage', () => {
  it('adapts to the dispatched action types', () => {
    expect(dispatchToastMessage(['send_alert', 'dispatch_drone'])).toBe(
      'Notification Published. Drone Mission Request Created.',
    );
    expect(dispatchToastMessage(['activate_shelter'])).toBe('Shelter Activation Recorded.');
    expect(dispatchToastMessage([])).toBe('Requests recorded.');
  });
});

describe('AlertCard', () => {
  it('is an article named by its title and shows the isolation window', () => {
    renderCard(SAMPLE_ALERT, stubAdapter());
    const card = screen.getByRole('article', { name: /zone a isolated: action required/i });
    expect(card).toBeTruthy();
    expect(within(card).getByText(/ISOLATION WINDOW: 45:00/)).toBeTruthy();
    expect(within(card).getByText('PENDING')).toBeTruthy();
  });

  it('renders a checked checkbox per proposed action', () => {
    renderCard(SAMPLE_ALERT, stubAdapter());
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(SAMPLE_ALERT.proposedActions.length);
    for (const box of boxes) expect((box as HTMLInputElement).checked).toBe(true);
  });

  it('approve sends only the checked actionIds and reaches DISPATCHED', async () => {
    const user = userEvent.setup();
    const approve = vi.fn().mockResolvedValue({ ...SAMPLE_ALERT, status: 'dispatched' });
    renderCard(SAMPLE_ALERT, stubAdapter({ approve }));

    // Uncheck the drone action; only the shelter should be approved.
    await user.click(screen.getByLabelText(/create drone mission request/i));
    await user.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => expect(approve).toHaveBeenCalledWith('alert-zone-a-1', ['act-shelter-b']));
    expect((await screen.findAllByText(/DISPATCHED/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^approve$/i })).toBeNull();
  });

  it('shows a toast adapted to the approved actions after dispatch', async () => {
    const user = userEvent.setup();
    const approve = vi.fn().mockResolvedValue({ ...SAMPLE_ALERT, status: 'dispatched' });
    renderCard(SAMPLE_ALERT, stubAdapter({ approve }));

    await user.click(screen.getByRole('button', { name: /approve/i }));
    // Both actions checked → shelter + drone message (appears in the live region and the toast).
    expect((await screen.findAllByText(/Drone Mission Request Created\./)).length).toBeGreaterThan(
      0,
    );
  });

  it('disables Approve when no action is checked', async () => {
    const user = userEvent.setup();
    renderCard(SAMPLE_ALERT, stubAdapter());
    for (const box of screen.getAllByRole('checkbox')) await user.click(box);
    expect((screen.getByRole('button', { name: /approve/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('surfaces an error with role=alert when approve rejects', async () => {
    const user = userEvent.setup();
    const approve = vi
      .fn()
      .mockRejectedValue(new DataAdapterError('CONFLICT', 'already dispatched'));
    renderCard(SAMPLE_ALERT, stubAdapter({ approve }));

    await user.click(screen.getByRole('button', { name: /approve/i }));
    const err = await screen.findByRole('alert');
    expect(err.textContent).toBe('already dispatched');
    // Still approvable after an error (button returns to idle/error, not dispatched).
    expect(screen.getByRole('button', { name: /approve/i })).toBeTruthy();
  });

  it('starts in the dispatched state for an already-dispatched alert', () => {
    renderCard({ ...SAMPLE_ALERT, status: 'dispatched' }, stubAdapter());
    expect(screen.getAllByText(/DISPATCHED/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
  });
});
