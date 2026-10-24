import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { formatCountdown, useCountdown } from '../src/hooks/useCountdown';

afterEach(cleanup);

describe('formatCountdown', () => {
  it('zero-pads MM:SS and never goes below 00:00', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(5)).toBe('00:05');
    expect(formatCountdown(65)).toBe('01:05');
    expect(formatCountdown(45 * 60)).toBe('45:00');
    expect(formatCountdown(-10)).toBe('00:00');
  });
});

function Probe({ minutes, startAt }: { minutes: number; startAt: number }) {
  const { label } = useCountdown(minutes, startAt);
  return <span data-testid="label">{label}</span>;
}

describe('useCountdown', () => {
  it('counts down once a second from createdAt + window and clamps at 00:00', () => {
    vi.useFakeTimers();
    const start = 1_000_000;
    vi.setSystemTime(start);
    try {
      render(<Probe minutes={1} startAt={start} />);
      expect(screen.getByTestId('label').textContent).toBe('01:00');

      // advanceTimersByTime both moves the fake clock and fires the interval.
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByTestId('label').textContent).toBe('00:59');

      act(() => vi.advanceTimersByTime(59_000));
      expect(screen.getByTestId('label').textContent).toBe('00:00');

      // Past the window it stays clamped, not negative.
      act(() => vi.advanceTimersByTime(60_000));
      expect(screen.getByTestId('label').textContent).toBe('00:00');
    } finally {
      vi.useRealTimers();
    }
  });
});
