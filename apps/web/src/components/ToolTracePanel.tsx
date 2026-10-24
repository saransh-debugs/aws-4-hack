/**
 * "How the agent got here" (part of Task 13b, H9). A plain-English account of each check the
 * agent ran, with numbered citations, then the alert's own points with a citation after every
 * number, then the sources. Template alerts (no tool trace) get the same account built from the
 * engine result, labelled as such.
 *
 * Collapsed by default. The toggle is a native button with `aria-expanded`.
 */
import { useId, useMemo, useState } from 'react';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import type { AlertCardData } from '@gridrisk/shared';
import { ROADS, SHELTERS, ZONES } from '@gridrisk/shared/fixtures';
import { analyze } from '@gridrisk/engine';
import { useGridStore } from '../store';
import { explainTrace, type Part } from './explainTrace';

export interface ToolTracePanelProps {
  alert: AlertCardData;
  /** Start open (for a demo or a story). Defaults to collapsed. */
  defaultOpen?: boolean;
}

function Sentence({ parts, citeId }: { parts: Part[]; citeId: (n: number) => string }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === 'text') return <span key={i}>{p.text}</span>;
        if (p.kind === 'value') {
          return (
            <strong key={i} className="font-semibold text-sky-200">
              {p.text}
            </strong>
          );
        }
        if (p.n.length === 0) return null;
        return (
          <sup key={i} className="ml-0.5 font-mono text-[10px] text-sky-300">
            {p.n.map((n) => (
              <a
                key={n}
                href={`#${citeId(n)}`}
                aria-label={`Source ${n}`}
                className="hover:underline focus-visible:outline-2 focus-visible:outline-sky-400"
              >
                [{n}]
              </a>
            ))}
          </sup>
        );
      })}
    </>
  );
}

export function ToolTracePanel({ alert, defaultOpen = false }: ToolTracePanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const events = useGridStore((s) => s.events);
  const baseId = useId();
  const citeId = (n: number) => `${baseId}-src-${n}`;

  const explanation = useMemo(() => {
    const fallback = analyze(events, ZONES, { shelters: SHELTERS }).find(
      (r) => r.zoneId === alert.zoneId,
    );
    return explainTrace(
      alert,
      { zones: ZONES, roads: ROADS, shelters: SHELTERS, events },
      fallback,
    );
  }, [alert, events]);

  if (explanation.steps.length === 0) return null;
  const listId = `${baseId}-body`;

  return (
    <section aria-label="How the agent got here" className="rounded-md border border-slate-700">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold tracking-[0.14em] text-slate-200 uppercase hover:bg-slate-800/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400"
      >
        <ChevronRight
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        />
        <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
        How the agent got here
        <span className="ml-auto font-mono font-medium tracking-normal text-slate-400 normal-case tabular-nums">
          {explanation.steps.length} checks
        </span>
      </button>

      {open && (
        <div
          id={listId}
          className="space-y-3 border-t border-slate-700 px-3 py-3 text-[13px] leading-relaxed text-slate-200"
        >
          <p className="text-[12px] text-slate-300">
            {explanation.source === 'agent'
              ? 'Claude investigated with these checks. Every number comes from GridRisk’s engine and was verified before this alert was shown.'
              : 'Written by GridRisk’s built-in template (Claude was not used). It rests on the same engine checks:'}
          </p>

          <ol aria-label="Checks, in order" className="space-y-2">
            {explanation.steps.map((step, i) => (
              <li key={i} className="flex gap-2">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-semibold ${
                    step.failed ? 'bg-red-500/20 text-red-200' : 'bg-sky-500/20 text-sky-200'
                  }`}
                >
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold text-slate-100">{step.title}</p>
                  <p>
                    <Sentence parts={step.parts} citeId={citeId} />
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div>
            <h4 className="text-[11px] font-semibold tracking-[0.12em] text-slate-300 uppercase">
              Where the alert’s numbers come from
            </h4>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {explanation.points.map((parts, i) => (
                <li key={i}>
                  <Sentence parts={parts} citeId={citeId} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-[11px] font-semibold tracking-[0.12em] text-slate-300 uppercase">
              Sources
            </h4>
            <ol aria-label="Sources" className="mt-1 space-y-1 text-[12px] text-slate-300">
              {explanation.citations.map((c) => (
                <li key={c.n} id={citeId(c.n)} className="flex gap-2">
                  <span className="font-mono text-sky-300">[{c.n}]</span>
                  <span>
                    <span className="font-semibold text-slate-100">{c.origin}:</span> {c.detail}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
