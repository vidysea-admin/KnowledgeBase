/** Server-store adapter, deliberately no JSON-file approval CLI or inferred labels.
 * Its caller establishes trusted human authority and verifies persisted audits/current seed.
 * evaluate/aggregate are the existing extraction evaluator, injected to retain bundle support. */
export function importAuthorizedExtraction(seed, state, evaluate, aggregate) {
  if (state.format !== 'extraction-review-state-v1' || state.tenantId !== seed.tenantId || state.packetSha256 !== seed.packetSha256) throw new Error('extraction-import-binding');
  const cases = structuredClone(seed.cases), seen = new Set();
  for (const [id, review] of Object.entries(state.reviews)) {
    const item = seed.items.find(i => i.id === id), audit = review.audit.at(-1);
    if (!item || seen.has(id) || !audit || audit.itemId !== id || audit.inputSha256 !== item.inputSha256 || audit.revision !== review.revision || !item.options.some(o => JSON.stringify(o) === JSON.stringify(audit.label))) throw new Error('extraction-import-review');
    seen.add(id);
    const c = cases.find(c => c.id === item.caseId);
    if (!c || !['labels', 'factLabels', 'entityLabels'].includes(item.labelField)) throw new Error('extraction-import-case');
    (c[item.labelField] ??= []).push(structuredClone(audit.label));
  }
  const reports = cases.map(evaluate);
  return { cases, measurement: { cases: reports, summary: aggregate(reports) } };
}
