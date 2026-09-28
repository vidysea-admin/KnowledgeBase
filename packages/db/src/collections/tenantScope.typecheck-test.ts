// packages/db/src/collections/tenantScope.typecheck-test.ts — T-018 C6. Not a runtime test
// (no assertions run); its only job is to fail `tsc` if the tenant-less call below ever
// stops being a compile error. `pnpm -r typecheck` must stay clean with this file present —
// a real error here (any error other than the expected one) fails the build.
import { claims } from "./claims.js";
import { sessions } from "./sessions.js";
import { sources } from "./sources.js";
import { turns } from "./turns.js";
import { gaps } from "./gaps.js";
import { topics } from "./topics.js";
import { speakers } from "./speakers.js";
import { decisions } from "./decisions.js";
import { orgs } from "./orgs.js";
import { graphEdges } from "./graph-edges.js";

// @ts-expect-error — tenantId is required; calling coll() with no argument must not compile.
sources();
// @ts-expect-error — tenantId is required; calling coll() with no argument must not compile.
sessions();
// @ts-expect-error — tenantId is required; calling coll() with no argument must not compile.
turns();
// @ts-expect-error — tenantId is required; calling coll() with no argument must not compile.
claims();
// @ts-expect-error — tenantId is required; calling coll() with no argument must not compile.
gaps();
// @ts-expect-error — tenantId is required; calling coll() with no argument must not compile.
topics();
// @ts-expect-error — tenantId is required; calling coll() with no argument must not compile.
speakers();
// @ts-expect-error — tenantId is required; calling coll() with no argument must not compile.
decisions();
// @ts-expect-error — tenantId is required; calling coll() with no argument must not compile.
orgs();
// @ts-expect-error — tenantId is required; calling coll() with no argument must not compile.
graphEdges();

// The valid form typechecks fine (proves the accessors work, not just that they reject).
export const validCalls = () => {
  sources("toc");
  sessions("toc");
  turns("toc");
  claims("toc");
  gaps("toc");
  topics("toc");
  speakers("toc");
  decisions("toc");
  orgs("toc");
  graphEdges("toc");
};

/**
 * ISS-102/ISS-103. `scripts/sync-speakers.mjs` hands `speakers(tenantId)` to
 * `writeSpeakerDocs`, whose `SpeakerWriteTarget` interface lives in `@lkb/index`. That package
 * does not depend on this one, and the `.mjs` entrypoint is outside every typecheck scope, so
 * nothing would catch this accessor dropping a method the write relies on — which is exactly how
 * `replaceOne` got shipped on a path that could never run, the third recurrence of one shape
 * (ISS-060, ISS-065, ISS-068).
 *
 * This pins the surface in the package that OWNS it: remove or rename any of these three and
 * `pnpm -r typecheck` fails here, at the source of the drift rather than at 3am on a live run.
 */
/**
 * U4b/R2 (D-048). Same pin for `watch_heartbeat`: R8 says every read and write of watcher liveness
 * is tenant-scoped, and the only mechanical version of that claim is "a tenant-less call does not
 * compile". Without this line the accessor could be swapped for a raw `db.collection()` handle and
 * every runtime test would still pass — the ISS-078 shape. `watchHeartbeat` is imported lazily here
 * rather than at the top so this addition touches nothing above it.
 */
export const watchHeartbeatTenantPin = async () => {
  const { watchHeartbeat } = await import("./watch-heartbeat.js");
  // @ts-expect-error — tenantId is required; calling coll() with no argument must not compile.
  watchHeartbeat();
  const coll = watchHeartbeat("toc");
  const _find = coll.find;
  const _update = coll.updateOne;
  void _find;
  void _update;
};

export const speakerWriteSurface = () => {
  const coll = speakers("toc");
  const _count: (filter?: object) => Promise<number> = coll.countDocuments;
  const _delete: (filter: object) => Promise<{ deletedCount: number }> = coll.deleteMany;
  const _insert = coll.insertOne;
  void _count;
  void _delete;
  void _insert;
};
