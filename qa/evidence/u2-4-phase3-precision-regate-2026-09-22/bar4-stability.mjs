// bar4-stability.mjs -- ISS-283: bar 4 is only MEASURABLE when every pinned session has every expected outer
// run and every run executed all its provider calls. A session with fewer runs, or a run that stopped early,
// makes the bar unmeasurable (not "unstable", and never stable); allStable then cannot be true.
export const EXPECTED_OUTER_RUNS = [1, 2, 3];
const INTERNAL_RUNS = 3; // 04-regate-eval.mts: providerCalls == windows * 3 for a complete run

/** pinned: session ids that must be covered. perRun: scored runs [{session,outerRun,windows,providerCalls,acceptedSet}]. */
export function bar4({ pinned, perRun, expectedRuns = EXPECTED_OUTER_RUNS }) {
  const perSession = pinned.map((s) => {
    const runs = perRun.filter((r) => r.session === s).sort((a, b) => a.outerRun - b.outerRun);
    const sets = runs.map((r) => JSON.stringify([...r.acceptedSet]));
    const have = runs.map((r) => r.outerRun);
    const complete = expectedRuns.every((n) => have.includes(n)) && runs.every((r) => r.providerCalls === r.windows * INTERNAL_RUNS);
    return { session: s, outerRuns: runs.length, complete, stable: complete && new Set(sets).size === 1, acceptedSets: sets };
  });
  const callsExecuted = perRun.reduce((n, r) => n + r.providerCalls, 0);
  const callsExpected = pinned.reduce((n, s) => { const r = perRun.find((x) => x.session === s); return n + (r ? r.windows * INTERNAL_RUNS * expectedRuns.length : 0); }, 0);
  const measurable = perSession.every((p) => p.complete);
  return { perSession, measurable, allStable: measurable && perSession.every((p) => p.stable), callsExecuted, callsExpected };
}
