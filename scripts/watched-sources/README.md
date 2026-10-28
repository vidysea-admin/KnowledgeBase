# Watched-source cadence

The trusted API host invokes `runWatchedSourceSupervisor` after startup and awaits it during shutdown. Importing these modules starts nothing. `LKB_WATCHED_WORKER_ENABLED=1` is opt-in; its default is disabled. `LKB_WATCHED_WORKER_KEY` is an existing server-only API key with current `sources` and `ingest` scopes. No credential file or account is created. Deployment activation requires its own authorization.

Every five-minute cycle re-verifies the stored service identity and derives the tenant from that identity. It uses the existing guarded watched-source verifier and requires durable source jobs. A tick checks at most 25 watched entries, rotating in stable ID order so unchanged, not-due and failing entries cannot starve later entries. Key or tenant changes reset rotation. Restart resets only this optimization: successful fetch provenance and hash CAS, immutable pending jobs, approvals and downstream completion remain in their existing stores.

Queued means ingestion/indexing is pending. The existing source worker must execute those approved jobs before successful watched hashes are persisted. Fetch/ingest failures remain due and retryable; uncertain jobs retain their existing refusal boundary. Supervisor logs contain fixed status text, never keys, URLs or raw errors. Calls are serialized and shutdown drains the current tick before returning.

Fixture checks establish software behavior only. Actual Mongo concurrency, guarded live sources, changed/unchanged re-ingestion, authorized worker and active unattended host are T-053 P3/P4 acceptance gates.
