/** T-045 adapter-to-intake: fixtures only (fake exec/downloader/reader/hasher/transcribe/sink). No network, no yt-dlp/ffmpeg. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { intakeFromSource, IntakeError, type IntakePlan, type IntakeSink } from "./intake.js";
import { buildSourceRegistry, NoMatchingSourceError } from "./registry.js";
import { createRecordingSource } from "./sources/recording.js";
import { createDocumentSource } from "./sources/document.js";
import { createUrlSource } from "./sources/url.js";
import { createYoutubeSource, type YoutubeExec } from "./sources/youtube.js";
import { createOnairSource, createZoomRecordingSource, type HostedDownloadRequest } from "./sources/hosted-recording.js";
import { tenantSourceId, type Source } from "./source.js";
import { baseConsent, fakeBytesReader, fakeHasher, fakeTextReader, fakeUrlFetcher, FIXED_NOW, TENANT } from "./testUtils.js";

const WORK = "/work/media";
const ID = "dQw4w9WgXcQ";
const YT_URL = `https://www.youtube.com/watch?v=${ID}`;
const ONAIR_URL = "https://cloudonair.withgoogle.com/events/next-26-keynote";
const ZOOM_URL = "https://zoom.us/rec/share/AbCdEf123456_token";
const files = {
  [`${WORK}/yt-${ID}.m4a`]: new Uint8Array([1, 2, 3]),
  [`${WORK}/cloudonair-next-26-keynote.mp4`]: new Uint8Array([4, 5, 6]),
  [`${WORK}/zoom-recording-AbCdEf123456_token.mp4`]: new Uint8Array([7, 8, 9]),
};
let transcribeCalls = 0;
const transcribe = async () => {
  transcribeCalls++;
  return [
    { speakerRef: "spk:0", tStart: 0, tEnd: 2, text: "hello" },
    { speakerRef: "spk:1", tStart: 2, tEnd: 5, text: "world" },
  ];
};
const exec: YoutubeExec = async () => ({ exitCode: 0, stdout: `${WORK}/yt-${ID}.m4a\n` });
const downloader = async (r: HostedDownloadRequest) => ({ path: `${WORK}/${r.platform}-${r.id}.mp4` });
const common = { workDir: WORK, hasher: fakeHasher, reader: fakeBytesReader(files), transcribe, now: () => FIXED_NOW };

const registry = buildSourceRegistry({
  recording: createRecordingSource({ hasher: fakeHasher, reader: fakeBytesReader({}), transcribe }),
  document: createDocumentSource({ hasher: fakeHasher, reader: fakeTextReader({}) }),
  youtube: createYoutubeSource({ ...common, exec }),
  onair: createOnairSource({ ...common, downloader }),
  zoomRecording: createZoomRecordingSource({ ...common, downloader }),
  url: createUrlSource({ hasher: fakeHasher, fetcher: fakeUrlFetcher({}) }),
});

function memSink() {
  const plans: IntakePlan[] = [];
  const sink: IntakeSink & { plans: IntakePlan[]; saves: number; failSave: boolean } = {
    plans,
    saves: 0,
    failSave: false,
    async findSessionBySource(tenantId, sourceId) {
      const p = plans.find((x) => x.session.tenantId === tenantId && x.source._id === sourceId);
      return p ? { sessionId: p.session._id } : undefined;
    },
    async save(plan) {
      sink.saves++;
      if (sink.failSave) throw new Error("db down https://zoom.us/rec/share/SECRET");
      plans.push(plan);
    },
  };
  return sink;
}
function deps(sink: IntakeSink, adapters: Source[] = registry) {
  let n = 0;
  return { adapters, sink, newId: () => `sess-${++n}`, now: () => "2026-10-12T10:00:00.000Z" };
}

const CASES: Array<[string, string]> = [
  ["youtube", YT_URL],
  ["cloudonair", ONAIR_URL],
  ["zoom-recording", ZOOM_URL],
];

for (const [name, url] of CASES) {
  test(`${name}: adapter output becomes source + session + turns`, async () => {
    const sink = memSink();
    const r = await intakeFromSource({ url, tenantId: TENANT }, baseConsent(), deps(sink));
    assert.equal(r.status, "created");
    assert.equal(sink.plans.length, 1);
    const p = sink.plans[0]!;
    assert.equal(p.source.tenantId, TENANT);
    assert.equal(p.session.sourceId, p.source._id);
    assert.equal(p.session.title, p.source.url); // no sourceMeta.title -> canonical url
    assert.equal(p.session.date, "2026-10-12");
    assert.deepEqual(p.session.status, { transcribe: "done", index: "pending" });
    assert.equal(p.media.length, 1);
    assert.deepEqual(p.turns.map((t) => t._id), ["sess-1-t001", "sess-1-t002"]);
    assert.ok(p.turns.every((t) => t.tenantId === TENANT && t.sessionId === "sess-1"));
    assert.equal(p.turns[1]!.text, "world");
    assert.equal(r.status === "created" && r.turnCount, 2);
  });

  test(`${name}: re-ingest is idempotent (D-135): existing session id, nothing created, no re-transcribe`, async () => {
    const sink = memSink();
    const first = await intakeFromSource({ url, tenantId: TENANT }, baseConsent(), deps(sink));
    const t0 = transcribeCalls;
    const second = await intakeFromSource({ url, tenantId: TENANT }, baseConsent(), deps(sink));
    assert.equal(second.status, "already-ingested");
    assert.equal(second.sessionId, first.sessionId);
    assert.equal(second.sourceId, first.sourceId);
    assert.equal(sink.saves, 1);
    assert.equal(sink.plans.length, 1);
    assert.equal(transcribeCalls, t0);
  });
}

test("same media in another tenant is not 'already ingested' for this tenant", async () => {
  const sink = memSink();
  await intakeFromSource({ url: YT_URL, tenantId: "tenant-a" }, baseConsent(), deps(sink));
  const r = await intakeFromSource({ url: YT_URL, tenantId: "tenant-b" }, baseConsent(), deps(sink));
  assert.equal(r.status, "created");
  assert.equal(sink.plans.length, 2);
});

function stub(tenant: string, turns: number, title?: unknown): Source {
  return {
    name: "stub",
    detect: () => true,
    fetch: async (_i, c) => ({
      source: {
        _id: tenantSourceId(tenant, "h"),
        tenantId: tenant,
        kind: "url",
        captureMode: c.captureMode,
        url: "u",
        hash: "h",
        consent: { given: true, recordedBy: "x" },
        createdAt: FIXED_NOW,
        sourceMeta: { title },
      } as never,
      media: [],
    }),
    toTurns: async () => Array.from({ length: turns }, () => ({ speakerRef: "s", tStart: 0, tEnd: 1, text: "t" })),
  };
}

test("sourceMeta.title is used when present and non-empty, else falls back to the url", async () => {
  for (const [title, expected] of [["  Next 26 Keynote ", "Next 26 Keynote"], ["   ", "u"], [42, "u"], [undefined, "u"]] as const) {
    const sink = memSink();
    await intakeFromSource({ tenantId: TENANT }, baseConsent(), deps(sink, [stub(TENANT, 1, title)]));
    assert.equal(sink.plans[0]!.session.title, expected);
  }
});

test("fails closed: no tenant, unmatched input, no turns, tenant mismatch, sink failure leaks nothing", async () => {
  const sink = memSink();
  await assert.rejects(intakeFromSource({ url: YT_URL }, baseConsent(), deps(sink)), (e: unknown) => e instanceof IntakeError && e.code === "invalid-input");
  await assert.rejects(intakeFromSource(YT_URL, baseConsent(), deps(sink)), (e: unknown) => e instanceof IntakeError && e.code === "invalid-input");
  await assert.rejects(intakeFromSource({ url: "ftp://x", tenantId: TENANT }, baseConsent(), deps(sink)), NoMatchingSourceError);
  await assert.rejects(intakeFromSource({ tenantId: TENANT }, baseConsent(), deps(sink, [stub(TENANT, 0)])), (e: unknown) => e instanceof IntakeError && e.code === "no-turns");
  await assert.rejects(intakeFromSource({ tenantId: TENANT }, baseConsent(), deps(sink, [stub("other", 1)])), (e: unknown) => e instanceof IntakeError && e.code === "tenant-mismatch");
  assert.equal(sink.saves, 0);

  sink.failSave = true;
  await assert.rejects(
    intakeFromSource({ url: ZOOM_URL, tenantId: TENANT }, baseConsent(), deps(sink)),
    (e: unknown) => e instanceof IntakeError && e.code === "sink-failed" && !/SECRET/.test(e.message),
  );
});

test("consent refusal from the adapter propagates and persists nothing", async () => {
  const sink = memSink();
  await assert.rejects(intakeFromSource({ url: ONAIR_URL, tenantId: TENANT }, baseConsent({ given: false }), deps(sink)), /consent-refused/);
  assert.equal(sink.saves, 0);
});

// ---- ISS-T045INTAKE-001: tenant-scoped source identity ----
/** Deliberately tenant-IGNORING sink: matches on sourceId alone and (like a global-unique _id index) rejects duplicate ids. */
function ignoringSink() {
  const plans: IntakePlan[] = [];
  const ids = new Set<string>();
  const sink: IntakeSink & { plans: IntakePlan[]; lookups: Array<[string, string]> } = {
    plans,
    lookups: [],
    async findSessionBySource(tenantId, sourceId) {
      sink.lookups.push([tenantId, sourceId]);
      const p = plans.find((x) => x.source._id === sourceId); // ignores tenantId
      return p ? { sessionId: p.session._id } : undefined;
    },
    async save(plan) {
      if (ids.has(plan.source._id)) throw new Error("E11000 duplicate key sources._id");
      ids.add(plan.source._id);
      plans.push(plan);
    },
  };
  return sink;
}

for (const [name, url] of CASES) {
  test(`ISS-T045INTAKE-001 ${name}: tenant B ingesting tenant A's bytes gets its own session, never learns of A's, even via a tenant-ignoring sink`, async () => {
    const sink = ignoringSink();
    const d = deps(sink); // one shared id counter across both tenants
    const a = await intakeFromSource({ url, tenantId: "tenant-a" }, baseConsent(), d);
    const b = await intakeFromSource({ url, tenantId: "tenant-b" }, baseConsent(), d);
    assert.equal(a.status, "created");
    assert.equal(b.status, "created"); // not already-ingested, not sink-failed (no duplicate-key collision)
    assert.notEqual(b.sessionId, a.sessionId);
    assert.notEqual(b.sourceId, a.sourceId);
    assert.equal(sink.plans.length, 2);
    const [pa, pb] = sink.plans as [IntakePlan, IntakePlan];
    assert.equal(pa.source.hash, pb.source.hash); // same bytes, bare hash kept as its own field
    assert.equal(pa.source._id, tenantSourceId("tenant-a", pa.source.hash));
    assert.equal(pb.source._id, tenantSourceId("tenant-b", pb.source.hash));
    assert.equal(pb.media[0]!.sourceRef, pb.source._id);
    assert.ok(pb.media[0]!._id.startsWith(pb.source._id));
    assert.equal(pa.source.tenantId, "tenant-a"); // A's doc is untouched
    // same-tenant re-ingest is still idempotent (D-135)
    const again = await intakeFromSource({ url, tenantId: "tenant-a" }, baseConsent(), d);
    assert.equal(again.status, "already-ingested");
    assert.equal(again.sessionId, a.sessionId);
    assert.equal(sink.plans.length, 2);
  });
}

test("ISS-T045INTAKE-001: tenantSourceId is injective across tenant/hash splits and validates input", () => {
  assert.notEqual(tenantSourceId("a", "b:c"), tenantSourceId("a:b", "c"));
  assert.notEqual(tenantSourceId("a", "h"), tenantSourceId("b", "h"));
  assert.equal(tenantSourceId("a", "h"), tenantSourceId("a", "h"));
  assert.throws(() => tenantSourceId("", "h"));
  assert.throws(() => tenantSourceId("a", ""));
});

test("ISS-T045INTAKE-001: a source whose _id is a bare hash (or another tenant's scoped id) is refused, nothing saved", async () => {
  for (const id of ["h", tenantSourceId("other", "h")]) {
    const sink = ignoringSink();
    const bare: Source = { ...stub(TENANT, 1), fetch: async (i, c) => { const r = await stub(TENANT, 1).fetch(i, c); return { ...r, source: { ...r.source, _id: id } }; } };
    await assert.rejects(intakeFromSource({ tenantId: TENANT }, baseConsent(), deps(sink, [bare])), (e: unknown) => e instanceof IntakeError && e.code === "unscoped-source");
    assert.equal(sink.plans.length, 0);
    assert.equal(sink.lookups.length, 0);
  }
});
