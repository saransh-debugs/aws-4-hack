/**
 * Tool-trace panel, part of Task 13b (author: Saransh, owner/reviewer: Bushra). Consumes H9.
 *
 * Shows judges how the agent reached its alert: every tool Claude called, in order, with a
 * short input and the key numbers it got back. Those numbers come from the deterministic
 * engine, which is the point of the panel. Template alerts have no `toolTrace`, so the panel
 * renders nothing for them.
 *
 * Drop it into the AlertCard slot: `<ToolTracePanel trace={alert.toolTrace} />`.
 * Collapsed by default. The toggle is a native button with `aria-expanded`, so Tab reaches it
 * and Enter/Space opens it.
 */
import { useId, useState } from 'react';
import { ChevronRight, Workflow } from 'lucide-react';
import type { ToolTraceEntry } from '@gridrisk/shared';

export interface ToolTracePanelProps {
  trace?: ToolTraceEntry[];
  /** Start open (for a demo or a story). Defaults to collapsed. */
  defaultOpen?: boolean;
}

/** Most fields shown per side, so a long output doesn't swamp the card. */
const MAX_FIELDS = 4;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** `zoneId=zone-a`. Only scalar fields; an empty or missing input reads "no input". */
export function summarizeInput(input: unknown): string {
  if (!isRecord(input)) return input === undefined || input === null ? 'no input' : String(input);
  const parts = Object.entries(input)
    .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))
    .slice(0, MAX_FIELDS)
    .map(([k, v]) => `${k}=${String(v)}`);
  return parts.length > 0 ? parts.join(', ') : 'no input';
}

/**
 * The key facts of a tool result: numbers and booleans as-is, arrays as a count, short strings
 * as-is. Nested objects are skipped. A failed call becomes a single `error` field.
 */
export function summarizeOutput(output: unknown): { label: string; value: string }[] {
  if (!isRecord(output)) return [];
  if (typeof output.error === 'string') return [{ label: 'error', value: output.error }];
  const fields: { label: string; value: string }[] = [];
  for (const [label, v] of Object.entries(output)) {
    if (typeof v === 'number' || typeof v === 'boolean') fields.push({ label, value: String(v) });
    else if (Array.isArray(v)) fields.push({ label, value: String(v.length) });
    else if (typeof v === 'string' && v.length <= 40) fields.push({ label, value: v });
    if (fields.length === MAX_FIELDS) break;
  }
  return fields;
}

export function ToolTracePanel({ trace, defaultOpen = false }: ToolTracePanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const listId = useId();
  if (!trace || trace.length === 0) return null;

  return (
    <section aria-label="Agent tool trace" className="rounded-md border border-slate-800">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold tracking-[0.14em] text-slate-300 uppercase hover:bg-slate-800/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400"
      >
        <ChevronRight
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        />
        <Workflow aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-sky-300" />
        How the agent got here
        <span className="ml-auto font-mono font-medium tracking-normal text-slate-400 normal-case tabular-nums">
          {trace.length} {trace.length === 1 ? 'step' : 'steps'}
        </span>
      </button>

      {open && (
        <ol
          id={listId}
          aria-label="Tool calls, in order"
          className="divide-y divide-slate-800 border-t border-slate-800"
        >
          {trace.map((entry, i) => {
            const fields = summarizeOutput(entry.output);
            const failed = fields.length === 1 && fields[0]?.label === 'error';
            return (
              <li key={i} className="px-3 py-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="font-mono text-[12px] font-medium text-slate-100">
                    {entry.tool}
                  </span>
                  <span className="min-w-0 truncate font-mono text-[11px] text-slate-400">
                    ({summarizeInput(entry.input)})
                  </span>
                </div>
                {fields.length > 0 && (
                  <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-6 font-mono text-[11px]">
                    {fields.map(({ label, value }) => (
                      <div key={label} className="flex gap-1">
                        <dt className={failed ? 'text-red-300' : 'text-slate-400'}>{label}</dt>
                        <dd className={failed ? 'text-red-200' : 'text-slate-100 tabular-nums'}>
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
