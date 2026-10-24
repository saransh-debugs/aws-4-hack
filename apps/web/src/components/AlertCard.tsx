/**
 * Task 5 – AlertCard and approval UX (owner: Bushra).
 *
 * Renders one AlertCardData as an <article> named by its title. Slides in with framer-motion
 * (respecting prefers-reduced-motion), shows the isolation-window countdown, a checkbox per
 * proposed action (checked by default), and an Approve button with an idle → loading →
 * dispatched state machine plus an error state. After a successful dispatch it announces an
 * aria-live="polite" toast; a new critical alert is announced aria-live="assertive".
 *
 * The approval call only sends the actionIds that are still checked, and Approve is disabled when
 * none are checked. The agent tool-trace panel (H9) is rendered inside the card.
 */
import { useId, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { AlertCardData, ActionType } from '@gridrisk/shared';
import { useAdapter } from '../data/AdapterContext';
import { useCountdown, type Clock } from '../hooks/useCountdown';
import { ToolTracePanel } from './ToolTracePanel';

export interface AlertCardProps {
  alert: AlertCardData;
  /** Called with the updated alert after a successful approve, so the parent can refresh. */
  onApproved?: (alert: AlertCardData) => void;
  /** Injectable clock for the countdown (tests). */
  clock?: Clock;
}

type ApproveState = 'idle' | 'loading' | 'dispatched' | 'error';

/** A short, human toast that adapts to the actions that were actually dispatched. */
export function dispatchToastMessage(types: ActionType[]): string {
  const parts: string[] = [];
  if (types.includes('send_alert')) parts.push('SNS Alert Sent.');
  if (types.includes('dispatch_drone')) parts.push('Recon Drone Deployed.');
  if (types.includes('activate_shelter')) parts.push('Shelter Activated.');
  return parts.length > 0 ? parts.join(' ') : 'Actions dispatched.';
}

export function AlertCard({ alert, onApproved, clock }: AlertCardProps) {
  const adapter = useAdapter();
  const reduceMotion = useReducedMotion();
  const headingId = useId();

  const startAt = useMemo(() => Date.parse(alert.createdAt), [alert.createdAt]);
  const countdown = useCountdown(alert.isolationWindowMinutes, startAt, clock);

  const dispatched = alert.status === 'dispatched' || alert.status === 'approved';
  const [state, setState] = useState<ApproveState>(dispatched ? 'dispatched' : 'idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(alert.proposedActions.map((a) => a.id)),
  );

  const isCritical = alert.status === 'pending';
  const checkedIds = alert.proposedActions.map((a) => a.id).filter((id) => checked.has(id));
  const noneChecked = checkedIds.length === 0;

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const approve = async () => {
    if (noneChecked || state === 'loading' || state === 'dispatched') return;
    setState('loading');
    setErrorMessage(null);
    try {
      const updated = await adapter.approve(alert.id, checkedIds);
      const dispatchedTypes = updated.proposedActions
        .filter((a) => checked.has(a.id))
        .map((a) => a.type);
      setState('dispatched');
      setToast(dispatchToastMessage(dispatchedTypes));
      onApproved?.(updated);
    } catch (err) {
      setState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Approval failed');
    }
  };

  return (
    <motion.article
      aria-labelledby={headingId}
      initial={reduceMotion ? false : { x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.3, ease: 'easeOut' }}
      className="space-y-3 rounded-md border border-red-500/40 bg-slate-900 p-3 shadow-lg"
    >
      {/* A new critical (still-pending) alert is announced assertively. */}
      {isCritical && (
        <span className="sr-only" role="status" aria-live="assertive">
          New critical alert raised for zone {alert.zoneId}. {alert.points[0] ?? ''}
        </span>
      )}

      <header className="space-y-1">
        <h3 id={headingId} className="font-mono text-sm font-semibold tracking-wide text-red-300">
          {alert.title}
        </h3>
        <p className="font-mono text-xs text-slate-300">
          {state === 'dispatched' ? '✅ DISPATCHED' : 'PENDING'}
        </p>
        <p className="font-mono text-xs text-amber-300 tabular-nums">
          ⏱️ ISOLATION WINDOW: {countdown.label}
        </p>
      </header>

      <ul className="list-disc space-y-1 pl-5 text-[13px] leading-snug text-slate-100">
        {alert.points.map((point, i) => (
          <li key={i}>{point}</li>
        ))}
      </ul>

      {state !== 'dispatched' && (
        <fieldset className="space-y-1.5">
          <legend className="text-[11px] font-semibold tracking-[0.14em] text-slate-300 uppercase">
            Proposed actions
          </legend>
          {alert.proposedActions.map((action) => {
            const id = `${headingId}-${action.id}`;
            return (
              <label key={action.id} htmlFor={id} className="flex items-start gap-2 text-[13px]">
                <input
                  id={id}
                  type="checkbox"
                  checked={checked.has(action.id)}
                  onChange={() => toggle(action.id)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-sky-500"
                />
                <span className="text-slate-100">{action.label}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      {state !== 'dispatched' && (
        <button
          type="button"
          onClick={() => void approve()}
          disabled={state === 'loading' || noneChecked}
          className="inline-flex items-center gap-1.5 rounded border border-sky-500 bg-sky-600/20 px-3 py-1.5 font-mono text-xs font-semibold text-sky-100 hover:bg-sky-600/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:opacity-50"
        >
          {state === 'loading' ? 'Approving…' : 'Approve'}
        </button>
      )}

      {state === 'dispatched' && (
        <p className="font-mono text-xs font-semibold text-green-300">✅ DISPATCHED</p>
      )}

      {state === 'error' && errorMessage && (
        <p role="alert" className="font-mono text-xs text-red-300">
          {errorMessage}
        </p>
      )}

      {/* Polite toast after a successful dispatch. */}
      <div aria-live="polite" className="sr-only">
        {toast}
      </div>
      {toast && (
        <p className="rounded border border-green-500/40 bg-green-500/10 px-2.5 py-1.5 font-mono text-xs text-green-200">
          {toast}
        </p>
      )}

      <ToolTracePanel alert={alert} />
    </motion.article>
  );
}
