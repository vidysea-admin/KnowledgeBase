# T058 export/download UI survey

2026-10-15. Read-only application survey; no implementation gap demonstrated in the assigned boundary. No application file lease requested and no source changed. Saved-output UI freshness is separately owned; outputverifier4 remains reserved.

Inspected: apps/web/src/pages/knowledge-outputs/KnowledgeOutputsPage.tsx; apps/web/src/api/knowledge-outputs.ts; apps/api/src/knowledge-outputs/{service.ts,markdown.ts}; existing workbench UI/API test source.

The mounted page already exposes explicit Download Markdown control, disables it during edits/busy/unvalidated or empty output, POSTs authenticated output ID + revision, ignores responses from a superseded auth generation, and downloads a text/markdown Blob under the server filename. Errors surface through the operation alert. The server rechecks current evidence/revision and grounding before rendering. Export includes AI/human-review warning, revision/provider/policy/source coverage, literal claim text, quoted evidence, session/turn identifiers, speaker identity and temporal/character locators. Relative session links remain application-relative; evidence itself is present offline. No acceptance clause demonstrating a mandatory absolute deployment URL was found.

Existing source includes a UI create/edit/revalidate/download journey and API refusal/current-source/tenant/literal-rendering tests. These were inspected only; no tests/builds executed, no browser/network/liveDB calls. Broker and independent verifier retain actual execution/acceptance ownership. Actual browser file-save interoperability and human artifact review remain outstanding parent acceptance gates; this survey does not certify them or close T058.
