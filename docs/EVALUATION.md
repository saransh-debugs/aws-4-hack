# GridRisk evaluation

This fork adds a repeatable evaluation harness for the deterministic isolation engine. It is intended to make the project measurable and easier to improve independently of the original team repository.

## Current benchmark

The initial benchmark contains seven labeled scenarios (`calm`, `partial`, `escalation`, `reopened`, `zone-b`, `multi-zone`, and `storm`) across the two Houston fixture zones. Each case records the expected isolated zones, runs the engine, and compares expected versus predicted results.

Run it with:

```bash
npm run engine:evaluate
```

The command prints a JSON report containing:

- true positives, true negatives, false positives, and false negatives;
- precision, recall, F1, false-alert rate, and missed-alert rate;
- minimum, median, p95, and maximum deterministic engine latency;
- case-by-case expected and predicted zone IDs.

## How to interpret the results

The benchmark is synthetic and self-authored from the scenario definitions. A perfect score on it is a regression signal, not proof that the system is accurate in Houston operations. It confirms that the current rules match the documented scenario stories. It must not be described as field accuracy or validated emergency performance.

The current benchmark has seven cases and fourteen zone-level classifications. Its expected result is five true positives, nine true negatives, zero false positives, and zero false negatives. Latency is measured locally around the deterministic engine call, so it is useful for comparing code changes but is not an AWS end-to-end latency or service-level objective.

## Next evaluation work

To produce defensible operational metrics, add versioned cases from historical incidents or expert-reviewed replays. Each case should include the source timestamps, provider payload IDs, true road status, true outage status, affected zone, and the time at which an alert became actionable. Then add:

1. A holdout set that is never used to tune the rules.
2. Provider-level coverage, freshness, and failure-rate measurements.
3. End-to-end latency from provider fetch through dashboard alert.
4. Bedrock grounding checks for every numeric claim and action rationale.
5. Human evaluation of whether alerts reduce time spent connecting information to action.
6. Confidence intervals and a dated report so metrics cannot be mistaken for permanent guarantees.

Synthetic cases are appropriate for regression tests. Real-world accuracy claims require independently labeled operational data and review by emergency-management stakeholders.
