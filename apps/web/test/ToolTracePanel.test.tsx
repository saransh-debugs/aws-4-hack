import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertCardDataSchema, type ToolTraceEntry } from '@gridrisk/shared';
import { SAMPLE_ALERT } from '@gridrisk/shared/fixtures';
import { summarizeInput, summarizeOutput, ToolTracePanel } from '../src/components/ToolTracePanel';

afterEach(cleanup);

/** Shaped like the escalation trace the A3 loop records with the stub model. */
const TRACE: ToolTraceEntry[] = [
  {
    tool: 'correlate_zone',
    input: { zoneId: 'zone-a' },
    output: {
      zoneId: 'zone-a',
      outageEventIds: ['evt-outage-a'],
      closureEventIds: ['evt-closure-bridge'],
      emergencyEventIds: ['evt-911-1', 'evt-911-2', 'evt-911-3'],
    },
  },
  {
    tool: 'check_isolation',
    input: { zoneId: 'zone-a' },
    output: {
      isolated: true,
      closedAccessRoadIds: ['road-bridge'],
    },
  },
  {
    tool: 'get_dependent_patients',
    input: { zoneId: 'zone-a' },
    output: {
      zoneId: 'zone-a',
      dependentPatients: 340,
    },
  },
  {
    tool: 'compute_isolation_window',
    input: { zoneId: 'zone-a' },
    output: {
      avgBackupMinutes: 120,
      estimatedResponseMinutes: 75,
      isolationWindowMinutes: 45,
    },
  },
];

const toggle = () => screen.getByRole('button', { name: /how the agent got here/i });
const steps = () =>
  within(screen.getByRole('list', { name: /tool calls/i })).getAllByRole('listitem');

describe('summarizeInput', () => {
  it('lists scalar fields', () => {
    expect(summarizeInput({ zoneId: 'zone-a' })).toBe('zoneId=zone-a');
  });
  it('reads "no input" for empty or missing input', () => {
    expect(summarizeInput({})).toBe('no input');
    expect(summarizeInput(undefined)).toBe('no input');
  });
});

describe('summarizeOutput', () => {
  it('keeps numbers and booleans and counts arrays', () => {
    expect(summarizeOutput(TRACE[1]!.output)).toEqual([
      { label: 'isolated', value: 'true' },
      { label: 'closedAccessRoadIds', value: '1' },
    ]);
    expect(summarizeOutput(TRACE[3]!.output)).toContainEqual({
      label: 'isolationWindowMinutes',
      value: '45',
    });
  });
  it('turns a failed call into one error field', () => {
    expect(summarizeOutput({ error: 'Unknown zone: zone-z' })).toEqual([
      { label: 'error', value: 'Unknown zone: zone-z' },
    ]);
  });
  it('caps the number of fields', () => {
    expect(summarizeOutput({ a: 1, b: 2, c: 3, d: 4, e: 5 })).toHaveLength(4);
  });
});

describe('ToolTracePanel', () => {
  it('is hidden for a template alert (no trace)', () => {
    const { container } = render(<ToolTracePanel trace={SAMPLE_ALERT.toolTrace} />);
    expect(SAMPLE_ALERT.toolTrace).toBeUndefined();
    expect(container.innerHTML).toBe('');
  });

  it('is hidden for an empty trace', () => {
    const { container } = render(<ToolTracePanel trace={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('starts collapsed and shows the step count', () => {
    render(<ToolTracePanel trace={TRACE} />);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().textContent).toContain('4 steps');
    expect(screen.queryByRole('list', { name: /tool calls/i })).toBeNull();
  });

  it('renders the entries in call order with their key numbers', async () => {
    render(<ToolTracePanel trace={TRACE} />);
    await userEvent.click(toggle());
    const items = steps();
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('correlate_zone'),
      expect.stringContaining('check_isolation'),
      expect.stringContaining('get_dependent_patients'),
      expect.stringContaining('compute_isolation_window'),
    ]);
    expect(items[0]!.textContent).toContain('(zoneId=zone-a)');
    expect(items[0]!.textContent).toContain('emergencyEventIds3');
    expect(items[2]!.textContent).toContain('dependentPatients340');
    expect(items[3]!.textContent).toContain('isolationWindowMinutes45');
  });

  it('works with an AlertCardData that has a trace', async () => {
    const alert = AlertCardDataSchema.parse({ ...SAMPLE_ALERT, toolTrace: TRACE });
    render(<ToolTracePanel trace={alert.toolTrace} defaultOpen />);
    expect(steps()).toHaveLength(4);
  });

  it('toggles with the keyboard', async () => {
    const user = userEvent.setup();
    render(<ToolTracePanel trace={TRACE} />);

    await user.tab();
    expect(document.activeElement).toBe(toggle());
    await user.keyboard('{Enter}');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('list', { name: /tool calls/i }).id).toBe(
      toggle().getAttribute('aria-controls'),
    );
    await user.keyboard(' ');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('list', { name: /tool calls/i })).toBeNull();
  });
});
