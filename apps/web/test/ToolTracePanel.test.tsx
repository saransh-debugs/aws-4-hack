import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AlertCardData } from '@gridrisk/shared';
import { ROADS, SAMPLE_ALERT, SHELTERS, ZONES } from '@gridrisk/shared/fixtures';
import { analyze, buildScenario } from '@gridrisk/engine';
import { ToolTracePanel } from '../src/components/ToolTracePanel';
import { explainTrace, traceFromEngine, type Part } from '../src/components/explainTrace';
import { useGridStore } from '../src/store';

const events = buildScenario('escalation');
const result = analyze(events, ZONES, { shelters: SHELTERS }).find((r) => r.zoneId === 'zone-a')!;
const ctx = { zones: ZONES, roads: ROADS, shelters: SHELTERS, events };

/** An alert worded the way real Claude wrote it, with the agent's trace. */
const AGENT_ALERT: AlertCardData = {
  ...SAMPLE_ALERT,
  points: [
    '56 electricity-dependent patients are currently affected by the outage.',
    'Only 45 minutes remain in the isolation window, with an average backup of just 2 hours.',
    'Shelter B is on standby with capacity for 200 evacuees.',
  ],
  toolTrace: traceFromEngine(result, events, SHELTERS),
};

const textOf = (parts: Part[]) =>
  parts.map((p) => (p.kind === 'cite' ? p.n.map((n) => `[${n}]`).join('') : p.text)).join('');

describe('explainTrace', () => {
  const ex = explainTrace(AGENT_ALERT, ctx);
  const sourceNamed = (origin: string) => ex.citations.find((c) => c.origin === origin)!.n;

  it('describes each check in plain English, in order', () => {
    expect(ex.source).toBe('agent');
    expect(ex.steps.map((s) => s.title)).toEqual([
      'Read the live event feed',
      'Linked events to the zone',
      'Checked every road into the zone',
      'Counted patients who depend on power',
      'Looked for a shelter outside the zone',
      'Worked out the time left',
    ]);
    const isolation = textOf(ex.steps[2]!.parts);
    expect(isolation).toMatch(
      /Buffalo Bayou Access Bridge is closed\[\d\]\. It is the only road in, so Zone A is cut off\./,
    );
    expect(textOf(ex.steps[0]!.parts)).toContain(
      'including a critical power outage and a high-severity road closure',
    );
    expect(textOf(ex.steps[3]!.parts)).toContain(
      '56 people in Zone A rely on powered medical equipment',
    );
    expect(textOf(ex.steps[5]!.parts)).toMatch(/120 min\[\d\].*75 min\[\d\].*leaves 45 minutes/);
  });

  it('never shows code names (snake_case tools, camelCase fields, ids)', () => {
    const all = [
      ...ex.steps.flatMap((s) => [s.title, textOf(s.parts)]),
      ...ex.citations.map((c) => `${c.origin} ${c.detail}`),
    ].join(' ');
    expect(all).not.toMatch(/[a-z]+_[a-z]+/);
    expect(all.replaceAll('emPOWER', '')).not.toMatch(/\b[a-z]+[A-Z][a-zA-Z]+\b/);
    expect(all).not.toMatch(/zone-a|evt-|road-bridge/);
  });

  it('cites every number in the alert to its source', () => {
    const [patients, time, shelter] = ex.points.map(textOf);
    expect(patients).toContain(`56[${sourceNamed('HHS emPOWER')}]`);
    const [backup, response] = ex.citations
      .filter((c) => c.origin === 'Planning assumption')
      .map((c) => c.n);
    expect(time).toContain(`45[${backup}][${response}] minutes`);
    expect(time).toContain(`2[${backup}] hours`);
    expect(shelter).toContain(`200[${sourceNamed('Shelter registry')}]`);
  });

  it('lists sources people recognize', () => {
    expect(ex.citations.map((c) => c.origin)).toEqual(
      expect.arrayContaining([
        'Event feed',
        'Road network',
        'HHS emPOWER',
        'Shelter registry',
        'Planning assumption',
      ]),
    );
    expect(ex.citations.find((c) => c.origin === 'HHS emPOWER')?.detail).toContain(
      'ZIP 77002 and 77010',
    );
  });

  it('explains a template alert from the engine result', () => {
    const t = explainTrace(SAMPLE_ALERT, ctx, result);
    expect(t.source).toBe('engine');
    expect(t.steps).toHaveLength(6);
  });

  it('reports a failed check in words', () => {
    const failed = explainTrace(
      {
        ...AGENT_ALERT,
        toolTrace: [{ tool: 'check_isolation', input: {}, output: { error: 'Unknown zone' } }],
      },
      ctx,
    );
    expect(failed.steps[0]?.failed).toBe(true);
    expect(textOf(failed.steps[0]!.parts)).toContain('This check failed');
  });
});

describe('ToolTracePanel', () => {
  beforeEach(() => useGridStore.setState({ events }));
  afterEach(() => {
    cleanup();
    useGridStore.setState({ events: [] });
  });
  const toggle = () => screen.getByRole('button', { name: /how the agent got here/i });

  it('starts collapsed and opens with the keyboard', async () => {
    const user = userEvent.setup();
    render(<ToolTracePanel alert={AGENT_ALERT} />);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().textContent).toContain('6 checks');
    await user.tab();
    await user.keyboard('{Enter}');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    const checks = within(screen.getByRole('list', { name: /checks/i })).getAllByRole('listitem');
    expect(checks).toHaveLength(6);
    await user.keyboard(' ');
    expect(screen.queryByRole('list', { name: /checks/i })).toBeNull();
  });

  it('citation links point at the matching source', () => {
    render(<ToolTracePanel alert={AGENT_ALERT} defaultOpen />);
    const link = screen.getAllByRole('link', { name: 'Source 1' })[0]!;
    const target = document.getElementById(link.getAttribute('href')!.slice(1));
    expect(target?.textContent).toContain('[1]');
    expect(screen.getByRole('list', { name: 'Sources' })).toBeTruthy();
  });

  it('labels template alerts honestly', () => {
    render(<ToolTracePanel alert={SAMPLE_ALERT} defaultOpen />);
    expect(screen.getByText(/Claude was not used/)).toBeTruthy();
  });

  it('renders nothing when there is nothing to explain', () => {
    useGridStore.setState({ events: [] });
    const { container } = render(<ToolTracePanel alert={{ ...SAMPLE_ALERT, zoneId: 'zone-x' }} />);
    expect(container.innerHTML).toBe('');
  });
});
