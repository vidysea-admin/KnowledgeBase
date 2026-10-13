/**
 * scripts/eval/golden-set-diagnostics.mjs — the two leakage diagnostics the golden-set gate
 * (qa/gates/golden-set-redesign.md, Option C, condition 3) requires be re-run on any regenerated
 * set BEFORE its recall number is reported.
 *
 * WHY THESE TWO. `data/eval/golden-set.json` scored recall@5 = 1.000 with zero misses, which is
 * not a good result — it is an unfalsifiable one (ISS-071). The cause was structural: each
 * question was a verbatim `keyInsights` string lifted from the SAME `session_page.json` document
 * whose `summary` field retrieval then scores against. Same author, same pass, same rare named
 * entities. A recall number produced that way measures copy-detection, not retrieval.
 *
 * So a regenerated set needs two independent checks, because they fail in opposite directions:
 *
 *   1. VERBATIM OVERLAP — is the question literally a span of the target's own text? If yes, the
 *      eval is a string-matching tautology. Must stay ~0.
 *   2. UNIQUE-TOKEN PIN RATE — can a SINGLE token that occurs in exactly one session pin the
 *      answer? A question can be fully paraphrased (overlap 0) and still be trivial because it
 *      names "Flywire" and only one session ever says "Flywire". Measured at 63% on the leaky
 *      set; the gate requires "well below" that.
 *
 * Check 2 is the one that matters, and it is the one a paraphrasing fix does not fix. Both are
 * pure functions over data already on disk — no model, no network — so the checker can reproduce
 * them exactly.
 */

/** Lowercase word tokens. Deliberately the same shape the lexical scorer uses: split on \W+. */
export function tokenize(text) {
  return (text ?? "").toLowerCase().split(/\W+/).filter(Boolean);
}

/**
 * Longest run of consecutive question tokens that appears, in order, anywhere in the target's own
 * text. Reported as a fraction of the question's length.
 *
 * Whole-token n-grams rather than raw substrings: a raw substring match rewards shared prefixes
 * ("nation" inside "international") and would report overlap where a reader would see none.
 */
export function verbatimOverlap(question, targetText) {
  const q = tokenize(question);
  const hay = ` ${tokenize(targetText).join(" ")} `;
  if (q.length === 0) return 0;
  let best = 0;
  for (let i = 0; i < q.length; i++) {
    // Extend while the run still occurs; stop at the first miss — a longer run cannot then match.
    for (let len = best + 1; i + len <= q.length; len++) {
      if (!hay.includes(` ${q.slice(i, i + len).join(" ")} `)) break;
      best = len;
    }
  }
  return best / q.length;
}

/**
 * Tokens that occur in exactly ONE session across the whole corpus.
 * @param {Map<string,string>} textBySession sessionId -> all of that session's text
 */
export function globallyUniqueTokens(textBySession) {
  const sessionsPerToken = new Map();
  for (const [sessionId, text] of textBySession) {
    for (const t of new Set(tokenize(text))) {
      if (!sessionsPerToken.has(t)) sessionsPerToken.set(t, new Set());
      sessionsPerToken.get(t).add(sessionId);
    }
  }
  const unique = new Map();
  for (const [token, sessions] of sessionsPerToken) {
    if (sessions.size === 1) unique.set(token, [...sessions][0]);
  }
  return unique;
}

/**
 * A question is "pinned" when it contains a token unique to its own expected session — i.e. the
 * answer is findable by a single rare word, with no comprehension required.
 */
export function isPinnedByUniqueToken(question, expectedSessionId, uniqueTokens) {
  for (const t of new Set(tokenize(question))) {
    if (uniqueTokens.get(t) === expectedSessionId) return { pinned: true, token: t };
  }
  return { pinned: false, token: null };
}

/**
 * Run both diagnostics over a golden set.
 *
 * @param {Array<{id:string,question:string,expectedSessionId:string}>} questions
 * @param {Map<string,string>} textBySession  sessionId -> that session's own text (the corpus the
 *        retriever scores against)
 * @param {Map<string,string>} [sourceBySession] optional second surface to test overlap against
 *        (e.g. raw turns), when the question was generated from a different document than the one
 *        retrieval scores. Overlap is reported against the WORSE (higher) of the two, because
 *        leakage from either surface invalidates the number.
 */
export function diagnose(questions, textBySession, sourceBySession) {
  const unique = globallyUniqueTokens(textBySession);
  const rows = questions.map((q) => {
    const scored = textBySession.get(q.expectedSessionId) ?? "";
    const source = sourceBySession?.get(q.expectedSessionId);
    const overlap = Math.max(
      verbatimOverlap(q.question, scored),
      source === undefined ? 0 : verbatimOverlap(q.question, source),
    );
    const pin = isPinnedByUniqueToken(q.question, q.expectedSessionId, unique);
    return { id: q.id, expectedSessionId: q.expectedSessionId, overlap, pinned: pin.pinned, pinToken: pin.token };
  });

  const n = rows.length || 1;
  return {
    total: rows.length,
    meanVerbatimOverlap: rows.reduce((a, r) => a + r.overlap, 0) / n,
    maxVerbatimOverlap: rows.reduce((a, r) => Math.max(a, r.overlap), 0),
    nearVerbatim: rows.filter((r) => r.overlap >= 0.8).length,
    pinnedCount: rows.filter((r) => r.pinned).length,
    pinRate: rows.filter((r) => r.pinned).length / n,
    uniqueTokenCount: unique.size,
    rows,
  };
}
