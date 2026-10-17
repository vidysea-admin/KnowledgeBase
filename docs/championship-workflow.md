# Championship preparation and retained internal evidence

T-014 uses the existing Compete workflow. This runtime prepares a proposed event, freezes its exact source-cited question bank, records matched T-012 answers and internal scores, and reloads a durable evidence report. It never promotes manual scores to independent-human credibility or announces a victory.

Authenticate with the existing API key holding `compete` scope. Tenant identity comes exclusively from authentication. The Championship page creates a plan, reloads by event ID, freezes the bank, selects a planned pair, calls existing `/compete/start`, saves the original counsellor answer through existing `/compete/:id/score`, and retains that run's immutable snapshot in the event. JSON references are operator assertions, not verified participation or human review.

## Plan request

`POST /championship` accepts:

```json
{
  "title": "Proposed event title",
  "questions": [
    { "id": "stable-question-id", "text": "Exact real source question supplied by the operator", "source": { "kind": "toc", "reference": "Actual session/turn reference" } }
  ],
  "counsellors": [{ "id": "stable-counsellor-id", "name": "Actual proposed name", "evidenceReference": "Actual participation evidence or explicitly pending reference" }],
  "judges": [],
  "rubric": { "version": "draft-version", "reference": "Panel-owned rubric reference, when approved" },
  "reviewReference": "Named human review evidence, when actually available"
}
```

This example is a shape illustration, not a question-bank fixture or participation claim. Permitted source kinds are `toc`, `pathlynks`, and `counsellor`. Pathlynks questions require D-007 anonymisation and real human review; supplied references do not establish either. Do not enter raw student identifiers. No public export endpoint exists.

The server returns the generated event ID, revision and SHA256 digest of UTF-8 JSON of ordered exact question objects with `id`, `text`, `source.kind` and `source.reference`. Strings are preserved exactly; duplicate question IDs/text, ambiguous duplicate counsellor names and malformed Unicode refuse. The roster, bank, rubric and review reference have no edit endpoint. Correct a draft by creating a new event; old evidence remains retained.

`POST /championship/:id/freeze` requires `{expectedRevision, bankDigest}`. Freeze uses server time and compare-and-swap; a frozen bank cannot be frozen again. Freeze verifies bytes/digest only. It does not prove a reviewed bank or that no external AI saw the questions previously.

`POST /championship/:id/trials` requires `{expectedRevision, questionId, counsellorId, evalRunId}`. The store loads the existing evaluation under the authenticated tenant. Exact question text/name, internal credibility, both original answers, finite scores in [1,5], and run creation between freeze and capture are required. A pair or run cannot be added twice. Storage must reject reuse of one tenant evaluation ID across events as well. CAS conflicts require reload; they never silently overwrite another operator's result. Score and snapshot import are separate writes: an import failure leaves the actual T-012 run retained and visible for retry.

`GET /championship/:id` returns `{event, report}`. The report retains original answers/citations, bank identity and every planned pair's denominator. Missing pairs remain explicit; malformed stored snapshots refuse. Source-array presence is recorded separately from verified citation support. Observed scores are arithmetic totals, never a public outcome or inferred panel judgment.

For browser restart or an uncertain import receipt, reload the event first. A run already present in its report is retained successfully. Otherwise select the exact scheduled question/counsellor and enter the original scored Compete evaluation ID in the recovery field. Recovery imports its existing original score without rewriting the evaluation. An unscored or mismatched run refuses; keep its ID visible until its original score exists. Reload also clears a local pending preview when its receipt is already retained.

## Runtime integration and real acceptance

Central integration mounts `createChampionshipRouter` after the existing `requireAuth` middleware, supplies a durable schema-backed `ChampionshipStore`, and mounts `ChampionshipPage` in the authenticated web application. The store must tenant-scope all operations, validate documents, atomically replace only the expected revision, preserve frozen metadata, and reject reuse of evaluation IDs across events. No process-memory production store is sufficient.

Actual T-014 remains gated by Umesh's Q3 roster/judges, named human bank review, proof of freeze before AI exposure, independent panel-owned rubric/blind judging, agreed internal streak threshold and real qualification, complete T-013 readiness, actual matched human/AI responses and actual public-event evidence. Source tests and internal report completeness cannot close those gates.
