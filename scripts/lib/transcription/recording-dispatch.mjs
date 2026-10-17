/** Execute the recording plan: one initial whole-file attempt, then bounded chunk retries supplied by the driver. */
export async function dispatchRecordingTranscription({ plan, durationSeconds, chunkedBoundaries, singleAttempt, chunkAttempt, complete, log = () => {} }) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("invalid recording duration; publication refused");
  const results = [];
  const provenance = { requestedPath: plan?.kind ?? "chunked", actualPath: "chunked", singleAttempts: 0, fallbackReason: null };
  let boundaries = chunkedBoundaries;
  if (plan?.kind === "single") {
    provenance.singleAttempts = 1;
    try {
      const turns = await singleAttempt();
      if (complete(turns)) {
        results.push({ offsetSeconds: 0, turns });
        provenance.actualPath = "single";
        return { results, provenance };
      }
      provenance.fallbackReason = "single-incomplete";
    } catch {
      // Provider errors can contain request URLs/API keys or transcript text. Keep only a fixed code.
      provenance.fallbackReason = "single-failed";
    }
    log(`single call ${provenance.fallbackReason === "single-failed" ? "failed" : "incomplete"} -- falling back to chunked`);
    boundaries = plan.fallback?.chunks?.length ? plan.fallback.chunks : chunkedBoundaries;
    log(`chunked fallback: ${Array.isArray(boundaries) ? boundaries.length : 0} chunk(s)`);
  }
  if (!Array.isArray(boundaries) || boundaries.length === 0 || boundaries.length > 1000 ||
      boundaries.some(b => !Number.isFinite(b.start) || !Number.isFinite(b.end) || b.start < 0 || b.end <= b.start || b.end > durationSeconds)) {
    throw new Error("invalid recording chunk boundaries; publication refused");
  }
  for (const [index, { start, end }] of boundaries.entries()) {
    log(`chunk ${index + 1}/${boundaries.length} [${start}s-${end}s]`);
    results.push({ offsetSeconds: start, turns: await chunkAttempt(start, end, index) });
  }
  return { results, provenance };
}
