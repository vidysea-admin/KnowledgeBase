# Ollama metadata-only preflight (prepared, not executed)

Run only after root separately approves the live metadata step and the current provider/HTTP checker gate permits it. From repository root, use the broker's pinned Node:

`node qa/evidence/ollama-live-preflight/launch.mjs --offline-import-check`

This replacement launcher defaults to offline, installs a fetch trap before loading TypeScript/dependencies, and catches loader failures with a constant classification. Offline mode does not read `.env` and never calls transport; it imports existing boundaries and instantiates providers using a placeholder. The broker must execute this single offline probe before any separately authorized metadata retry. Initial failed receipt and its original script hash remain historical evidence; do not overwrite them.

Future live metadata mode requires the explicit `--live-metadata` argument and fresh root authorization. No retry is authorized by this packet.

The script privately reads only root `.env` into memory through `dotenv.parse`, selects `OLLAMA_API_KEY`, and never writes environment variables. It instantiates the existing cloud provider pair with exact requested model IDs and uses the hardened existing HTTP transport for one `GET /api/tags`: manual redirects refused, 10-second deadline, 256-KiB response cap. No generation or embedding endpoint exists in this script.

Only stdout is a JSON object with constant `status`, constant `failureClass`, and the two requested model availability entries. Failure classes are loader/auth/configuration/network/http/payload; arbitrary errors never escape. Offline success is `offline-ready` with unknown model availability. Live success is `metadata-ready`. No model catalogue, hosts, URLs, headers, credentials, source text or error messages are printed. Exit 0 = offline ready or both exact IDs listed; 1 = at least one missing; 2 = unknown. A cloud-suffixed alias is not silently accepted as the requested bare identifier. Listing proves only metadata availability, not successful generation or account generation entitlement.

No output files, database calls, paid model calls, network calls or execution were performed while preparing this packet. Invocation itself performs the single metadata request; it requires root authorization. Future tiny generation probes require separate approval/budget and a separately reviewed script.

Existing source freeze preserved: cloud adapter SHA256 `65A9D83AB43E5B61083BC6924534ABB281E357100958E5CEBFA3A68957736809`; HTTP transport SHA256 `AB266B7496F0B85C810A6C66CD3C5231598EA01E10ACAD741796E2C807E831F1`.
