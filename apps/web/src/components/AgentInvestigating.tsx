import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BrainCircuit } from 'lucide-react';

const STEPS = [
  'Reading the live event feed',
  'Linking outages and closures to the zone',
  'Checking every road into the zone',
  'Counting patients who depend on power',
  'Looking for a shelter with room',
  'Working out the time left',
  'Checking every number against the engine',
];

/**
 * Placeholder in the Alerts panel while the agent works on a zone the engine flagged as cut
 * off, until its alert arrives. Announced politely to screen readers.
 */
export function AgentInvestigating({ zoneName }: { zoneName: string }) {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 700);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.article
      aria-label={`AI agent investigating ${zoneName}`}
      initial={reduceMotion ? false : { x: 60, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.25 }}
      className="rounded-md border border-sky-500/50 bg-sky-500/5 p-3"
    >
      <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-sky-200 uppercase">
        <BrainCircuit
          aria-hidden="true"
          className="h-4 w-4 animate-pulse motion-reduce:animate-none"
        />
        AI agent investigating {zoneName}
      </p>
      <ol aria-live="polite" className="mt-2 space-y-1 font-mono text-[12px]">
        {STEPS.slice(0, step + 1).map((s, i) => (
          <li key={s} className={i === step ? 'text-slate-100' : 'text-slate-400'}>
            {i === step ? '▸ ' : '✓ '}
            {s}
            {i === step ? '…' : ''}
          </li>
        ))}
      </ol>
    </motion.article>
  );
}
