# GridRisk evaluation

This fork contains a repeatable evaluation harness for the deterministic isolation engine. It is designed to produce honest engineering evidence without presenting a small, self-authored fixture set as operational accuracy.

## Run the benchmark

```bash
npm ci
npm run engine:evaluate
```

The JSON report includes:

- development and holdout splits, so the score is not only measured on cases used while building the rules;
- confusion-matrix counts, accuracy, precision, recall, specificity, F1, balanced accuracy, Matthews correlation, false-alert rate, and missed-alert rate;
- Wilson 95% intervals for precision, recall, and false-alert rate;
- warm-up plus repeated p50/p95/p99 local engine latency;
- event-order and irrelevant-noise invariance checks;
- the benchmark version, SHA-256 manifest hash, Node/runtime information, and case-by-case predictions.

## Current evidence

The current manifest has seven synthetic cases and fourteen zone-level classifications. Four cases are development cases and three are holdout cases. The labels come from the scenario story in `packages/engine/src/scenarios.ts`, not from an independent incident log. The report therefore sets `fieldAccuracyAvailable: false` and must not be described as validated Houston accuracy.

On the current synthetic manifest, the engine is expected to produce five true positives and nine true negatives. The point estimates may be 100% because the benchmark is small and deliberately represents known behaviors; the Wilson intervals show the uncertainty instead of hiding it. For example, even a 5/5 recall result has a lower 95% bound below 1.0. The holdout split is useful as a regression check, but it is not independent real-world validation because it is still authored from the same fixture family.

Latency is measured after five warm-up calls and twenty-five measured calls per case. It measures only the in-process deterministic engine, not provider fetch, Lambda cold start, DynamoDB, Bedrock, API Gateway, or browser rendering. Compare latency between runs on the same hardware; do not claim it as an AWS SLA.

## Ten improvements implemented in this fork

1. Versioned benchmark manifest and SHA-256 case hash.
2. Development/holdout split with separate metrics.
3. Confusion matrix with class-imbalance-aware specificity and balanced accuracy.
4. Matthews correlation coefficient for a single summary that remains meaningful with imbalance.
5. Wilson 95% intervals so tiny samples cannot look certain.
6. False-alert and missed-alert rates, which map directly to operational risk.
7. Warmed, repeated p50/p95/p99 latency measurement instead of one timing sample.
8. Event-order invariance checks to catch order-dependent behavior.
9. Irrelevant-noise invariance checks to test that unrelated events do not create alerts.
10. Reproducibility metadata and automated tests that verify the benchmark structure.

## What is still needed for credible resume claims

The next evidence tier requires an independently labeled dataset: historical provider snapshots or expert-reviewed replays with source timestamps, provider record IDs, actual road/outage status, affected zones, and the time at which an alert became actionable. Keep a final test set hidden while tuning rules, add multiple incidents per zone and season, and report confidence intervals and failure examples. For the full product, also measure provider coverage/freshness, end-to-end ingestion-to-alert latency, Bedrock grounding rate, action-request success rate, and coordinator time saved in a controlled usability study.

Until that work exists, resume language should say “built a reproducible synthetic evaluation benchmark” rather than “achieved 100% emergency prediction accuracy.”
