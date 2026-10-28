/**
 * packages/ingest/src/sources/media-sources-registry.test.ts — T-045 registration. Routing table through
 * `buildSourceRegistry` for every source incl. YouTube / OnAir / Zoom and look-alike URLs, plus the fetch
 * contract (schema conformance, tenant, argv hygiene, typed errors). Everything is in-memory: a fake exec,
 * fake downloader, fake reader/hasher/transcribe. No network, no yt-dlp/ffmpeg, no browser.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { buildSourceRegistry, detectSource, NoMatchingSourceError } from "../registry.js";
import { createRecordingSource } from "./recording.js";
import { createDocumentSource } from "./document.js";
import { createUrlSource } from "./url.js";
import { createWhatsAppSource } from "./whatsapp.js";
import {
  buildYtDlpArgs,
  createYoutubeSource,
  resolveFfmpegLocation,
  resolveYtDlpCommand,
  YoutubeSourceError,
  type YoutubeExec,
} from "./youtube.js";
import {
  createOnairSource,
  createZoomRecordingSource,
  HostedRecordingError,
  type HostedDownloadRequest,
} from "./hosted-recording.js";
import { baseConsent, fakeBytesReader, fakeHasher, fakeTextReader, fakeUrlFetcher, FIXED_NOW, TENANT } from "../testUtils.js";

const ID = "dQw4w9WgXcQ";
const WORK = "/work/media";
const BYTES = new Uint8Array([9, 8, 7, 6]);
const YT_FILE = `${WORK}/yt-${ID}.m4a`;
const ONAIR_URL = "https://cloudonair.withgoogle.com/events/next-26-keynote";
const ZOOM_URL = "https://zoom.us/rec/share/AbCdEf123456_token";

const execCalls: Array<{ cmd: string; args: string[] }> = [];
const okExec: YoutubeExec = async (cmd, args) => {
  execCalls.push({ cmd, args });
  return { exitCode: 0, stdout: `${YT_FILE}\n` };
};
const transcribe = async () => [{ speakerRef: "spk:0", tStart: 0, tEnd: 1, text: "hi" }];

function buildYoutube(exec: YoutubeExec = okExec, extra: Partial<Parameters<typeof createYoutubeSource>[0]> = {}) {
  return createYoutubeSource({
    workDir: WORK,
    exec,
    hasher: fakeHasher,
    reader: fakeBytesReader({ [YT_FILE]: BYTES }),
    transcribe,
    now: () => FIXED_NOW,
    ...extra,
  });
}

const downloads: HostedDownloadRequest[] = [];
const downloader = async (req: HostedDownloadRequest) => {
  downloads.push(req);
  return { path: `${WORK}/${req.platform}-${req.id}.mp4` };
};
const hostedFiles = {
  [`${WORK}/cloudonair-next-26-keynote.mp4`]: BYTES,
  [`${WORK}/zoom-recording-AbCdEf123456_token.mp4`]: BYTES,
};
function hostedDeps(withDownloader = true) {
  return {
    workDir: WORK,
    hasher: fakeHasher,
    reader: fakeBytesReader(hostedFiles),
    transcribe,
    now: () => FIXED_NOW,
    ...(withDownloader ? { downloader } : {}),
  };
}

const recording = createRecordingSource({ hasher: fakeHasher, reader: fakeBytesReader({}), transcribe });
const document = createDocumentSource({ hasher: fakeHasher, reader: fakeTextReader({}) });
const url = createUrlSource({ hasher: fakeHasher, fetcher: fakeUrlFetcher({}) });
const whatsapp = createWhatsAppSource({ hasher: fakeHasher, fetcher: async () => [] });
const youtube = buildYoutube();
const onair = createOnairSource(hostedDeps());
const zoom = createZoomRecordingSource(hostedDeps());

const registry = buildSourceRegistry({ recording, document, whatsapp, youtube, onair, zoomRecording: zoom, url });
const legacy = [recording, document, whatsapp, url];

function route(input: unknown): string {
  return detectSource(input, registry).name;
}
function legacyRoute(input: unknown): string | "none" {
  try {
    return detectSource(input, legacy).name;
  } catch (e) {
    if (e instanceof NoMatchingSourceError) return "none";
    throw e;
  }
}

const WA = { kind: "whatsapp", groupJid: "g@g.us", ownerUserId: "u1", tenantId: TENANT };

// [input, expected adapter]
const TABLE: Array<[string, unknown, string]> = [
  // existing sources: unchanged
  ["mp3 path", "session-42.mp3", "recording"],
  ["mp4 path", "C:\\rec\\webinar.mp4", "recording"],
  ["recording hint", { kind: "recording", path: "x", tenantId: TENANT }, "recording"],
  ["markdown path", "notes.md", "document"],
  ["whatsapp hint", WA, "whatsapp"],
  ["generic https page", "https://example.com/webinar-notes", "url"],
  ["generic http page", "http://example.com/x", "url"],
  ["pdf URL stays url", "https://example.com/report.pdf", "url"],
  ["url hint", { kind: "url", url: "https://example.com/p", tenantId: TENANT }, "url"],
  // new sources
  ["yt watch", `https://www.youtube.com/watch?v=${ID}`, "youtube"],
  ["yt apex + extra params", `https://youtube.com/watch?v=${ID}&t=30s&list=PLabc`, "youtube"],
  ["yt mobile", `https://m.youtube.com/watch?v=${ID}`, "youtube"],
  ["yt short link", `https://youtu.be/${ID}?si=abc`, "youtube"],
  ["yt live", `https://www.youtube.com/live/${ID}`, "youtube"],
  ["yt shorts", `https://www.youtube.com/shorts/${ID}`, "youtube"],
  ["yt object input", { url: `https://youtu.be/${ID}`, tenantId: TENANT }, "youtube"],
  ["yt url-hint wins over url", { kind: "url", url: `https://youtu.be/${ID}`, tenantId: TENANT }, "youtube"],
  ["onair event", ONAIR_URL, "cloudonair"],
  ["onair trailing slash + query", `${ONAIR_URL}/?utm_source=x`, "cloudonair"],
  ["onair upper-case host", "https://CloudOnAir.WithGoogle.com/events/next-26-keynote", "cloudonair"],
  ["onair object input", { url: ONAIR_URL, tenantId: TENANT }, "cloudonair"],
  ["zoom share", ZOOM_URL, "zoom-recording"],
  ["zoom share + pwd (dropped)", `${ZOOM_URL}?pwd=abc`, "zoom-recording"],
  ["zoom object input", { url: ZOOM_URL, tenantId: TENANT }, "zoom-recording"],
];

for (const [label, input, expected] of TABLE) {
  test(`routing: ${label} -> ${expected}`, () => {
    assert.equal(route(input), expected);
  });
}

// Look-alikes must NOT reach a new adapter. http(s) look-alikes fall through to the generic url adapter exactly
// as before (legacy route identical); non-http schemes match nothing.
const LOOKALIKES: Array<[string, string]> = [
  ["yt http", `http://www.youtube.com/watch?v=${ID}`],
  ["yt subdomain spoof", `https://www.youtube.com.evil.tld/watch?v=${ID}`],
  ["yt suffix spoof", `https://evilyoutube.com/watch?v=${ID}`],
  ["yt unlisted subdomain", `https://music.youtube.com/watch?v=${ID}`],
  ["yt userinfo @ trick (short link host as user)", `https://youtu.be@evil.tld/${ID}`],
  ["yt userinfo @ trick (real host after @ is evil)", `https://www.youtube.com@evil.tld/watch?v=${ID}`],
  ["yt userinfo creds", `https://user:pw@www.youtube.com/watch?v=${ID}`],
  ["yt port", `https://www.youtube.com:8443/watch?v=${ID}`],
  ["yt host in path", `https://evil.tld/youtu.be/${ID}`],
  ["yt id too short", "https://youtu.be/short"],
  ["yt id with injected flag", `https://youtu.be/--exec=calc.exe`],
  ["yt backslash trick", `https://www.youtube.com\\@evil.tld/watch?v=${ID}`],
  ["yt whitespace", `https://youtu.be/${ID} --exec`],
  ["onair http", "http://cloudonair.withgoogle.com/events/next-26-keynote"],
  ["onair subdomain spoof", "https://cloudonair.withgoogle.com.evil.tld/events/x1"],
  ["onair userinfo @", "https://cloudonair.withgoogle.com@evil.tld/events/x1"],
  ["onair host in path", "https://evil.tld/cloudonair.withgoogle.com/events/x1"],
  ["onair other subdomain", "https://www.cloudonair.withgoogle.com/events/x1"],
  ["onair extra path", `${ONAIR_URL}/extra`],
  ["onair encoded slug", "https://cloudonair.withgoogle.com/events/%2e%2e"],
  ["onair port", "https://cloudonair.withgoogle.com:444/events/x1"],
  ["zoom http", "http://zoom.us/rec/share/AbCdEf123456_token"],
  ["zoom subdomain spoof", "https://zoom.us.evil.tld/rec/share/AbCdEf123456_token"],
  ["zoom suffix spoof", "https://evilzoom.us/rec/share/AbCdEf123456_token"],
  ["zoom userinfo @", "https://zoom.us@evil.tld/rec/share/AbCdEf123456_token"],
  ["zoom unverified subdomain", "https://us02web.zoom.us/rec/share/AbCdEf123456_token"],
  ["zoom unverified play shape", "https://zoom.us/rec/play/AbCdEf123456_token"],
  ["zoom port", "https://zoom.us:444/rec/share/AbCdEf123456_token"],
  ["zoom host in path", "https://evil.tld/zoom.us/rec/share/AbCdEf123456_token"],
];
for (const [label, input] of LOOKALIKES) {
  test(`look-alike never reaches a new adapter, routes exactly as before: ${label}`, () => {
    const got = detectSource(input, registry).name;
    assert.ok(!["youtube", "cloudonair", "zoom-recording"].includes(got), `${input} -> ${got}`);
    assert.equal(got, legacyRoute(input));
  });
}
for (const input of ["ftp://youtu.be/" + ID, "javascript:alert(1)", "", "file:///c:/x", 42, null, undefined, {}]) {
  test(`non-http / junk input matches nothing: ${JSON.stringify(input) ?? String(input)}`, () => {
    assert.throws(() => route(input), NoMatchingSourceError);
    assert.equal(legacyRoute(input), "none");
  });
}

test("routing: every input the legacy registry routed keeps its adapter unless it is a strict new-source URL", () => {
  const newOnes = new Set(["youtube", "cloudonair", "zoom-recording"]);
  for (const [label, input] of TABLE) {
    const now = route(input);
    if (newOnes.has(now)) assert.ok(["url", "none"].includes(legacyRoute(input)), `${label}: only url-adapter / unmatched inputs may move`);
    else assert.equal(now, legacyRoute(input), label);
  }
});

test("registry order is fixed and url is last; swapped parts are refused", () => {
  assert.deepEqual(
    registry.map((s) => s.name),
    ["recording", "document", "whatsapp", "youtube", "cloudonair", "zoom-recording", "url"],
  );
  assert.throws(() => buildSourceRegistry({ recording, document, youtube: onair, onair: youtube, zoomRecording: zoom, url }), /must be the/);
  assert.equal(buildSourceRegistry({ recording, document, youtube, onair, zoomRecording: zoom, url }).length, 6);
});

// ---- contract conformance -------------------------------------------------------------------------------------
const HERE = dirname(fileURLToPath(import.meta.url));
const schemaOf = (n: string) => JSON.parse(readFileSync(resolve(HERE, "../../../../schema", `${n}.schema.json`), "utf8"));
function conforms(doc: Record<string, unknown>, schema: any, path = "$"): void {
  for (const k of schema.required ?? []) assert.ok(doc[k] !== undefined, `${path}.${k} required`);
  for (const [k, p] of Object.entries<any>(schema.properties ?? {})) {
    const v = doc[k];
    if (v === undefined) continue;
    const types: string[] = Array.isArray(p.type) ? p.type : p.type ? [p.type] : [];
    if (types.length) {
      const actual = Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
      assert.ok(types.includes(actual), `${path}.${k}: ${actual} not in ${types}`);
    }
    if (p.enum) assert.ok(p.enum.includes(v), `${path}.${k}: ${String(v)} not in enum`);
    if (typeof p.minLength === "number") assert.ok(String(v).length >= p.minLength, `${path}.${k} minLength`);
    if (p.type === "object" && typeof v === "object") conforms(v as Record<string, unknown>, p, `${path}.${k}`);
  }
}

const FETCH_CASES: Array<[string, () => ReturnType<typeof youtube.fetch>, string, string]> = [
  ["youtube", () => youtube.fetch({ url: `https://youtu.be/${ID}`, tenantId: "tenant-Y" }, baseConsent()), "tenant-Y", `https://www.youtube.com/watch?v=${ID}`],
  ["onair", () => onair.fetch({ url: `${ONAIR_URL}?utm=1#frag`, tenantId: "tenant-O" }, baseConsent({ captureMode: "public" })), "tenant-O", ONAIR_URL],
  ["zoom-recording", () => zoom.fetch({ url: `${ZOOM_URL}?pwd=secret`, tenantId: "tenant-Z" }, baseConsent()), "tenant-Z", ZOOM_URL],
];
for (const [name, run, tenant, canonical] of FETCH_CASES) {
  test(`${name}: fetch output matches sources/media schemas, carries tenant, canonical url only`, async () => {
    const { source, media } = await run();
    conforms(source as unknown as Record<string, unknown>, schemaOf("sources"));
    assert.equal(media.length, 1);
    conforms(media[0] as unknown as Record<string, unknown>, schemaOf("media"));
    assert.equal(source.tenantId, tenant);
    assert.equal(media[0]!.tenantId, tenant);
    assert.equal(media[0]!.sourceRef, source._id);
    assert.equal(source.kind, "url");
    assert.equal((source as { url?: string }).url, canonical);
    assert.ok(!JSON.stringify(source).includes("pwd=") && !JSON.stringify(source).includes("utm"));
    assert.equal(source.createdAt, FIXED_NOW);
    assert.equal((source as { path?: string }).path, media[0]!.path);
  });
}

test("hosted adapters: downloader only ever sees the canonical URL; toTurns delegates to the STT seam", async () => {
  downloads.length = 0;
  const { source } = await zoom.fetch({ url: `${ZOOM_URL}?pwd=secret#x`, tenantId: TENANT }, baseConsent());
  assert.deepEqual(downloads.map((d) => d.canonicalUrl), [ZOOM_URL]);
  assert.equal((await zoom.toTurns(source)).length, 1);
});

test("hosted adapters: no downloader -> typed downloader-unavailable (no partial doc)", async () => {
  const bare = createOnairSource(hostedDeps(false));
  await assert.rejects(bare.fetch({ url: ONAIR_URL, tenantId: TENANT }, baseConsent()), (e: unknown) => e instanceof HostedRecordingError && e.code === "downloader-unavailable");
});

test("hosted adapters: typed failures (invalid input, consent, download, escape, empty); Zoom token never in a message", async () => {
  const code = (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof HostedRecordingError ? e : String(e)));
  const r = async (p: Promise<unknown>) => {
    const e = await code(p);
    assert.ok(e instanceof HostedRecordingError, String(e));
    return e;
  };
  assert.equal((await r(zoom.fetch({ url: ZOOM_URL }, baseConsent()))).code, "invalid-input"); // no tenant
  assert.equal((await r(zoom.fetch({ url: "https://zoom.us.evil.tld/rec/share/AbCdEf123456_token", tenantId: TENANT }, baseConsent()))).code, "invalid-input");
  assert.equal((await r(zoom.fetch({ url: ZOOM_URL, tenantId: TENANT }, baseConsent({ captureMode: "silent" })))).code, "consent-refused");
  assert.equal((await r(zoom.fetch({ url: ZOOM_URL, tenantId: TENANT }, baseConsent({ given: false })))).code, "consent-refused");
  const boom = createZoomRecordingSource({ ...hostedDeps(), downloader: async (q) => { throw new Error(`failed ${q.canonicalUrl}`); } });
  const e1 = await r(boom.fetch({ url: ZOOM_URL, tenantId: TENANT }, baseConsent()));
  assert.equal(e1.code, "download-failed");
  assert.ok(!e1.message.includes("AbCdEf123456_token"));
  const escape = createOnairSource({ ...hostedDeps(), downloader: async () => ({ path: "/etc/passwd" }) });
  assert.equal((await r(escape.fetch({ url: ONAIR_URL, tenantId: TENANT }, baseConsent()))).code, "path-escape");
  const dotdot = createOnairSource({ ...hostedDeps(), downloader: async () => ({ path: `${WORK}/../x.mp4` }) });
  assert.equal((await r(dotdot.fetch({ url: ONAIR_URL, tenantId: TENANT }, baseConsent()))).code, "path-escape");
  const empty = createOnairSource({ ...hostedDeps(), reader: fakeBytesReader({ [`${WORK}/cloudonair-next-26-keynote.mp4`]: new Uint8Array() }) });
  assert.equal((await r(empty.fetch({ url: ONAIR_URL, tenantId: TENANT }, baseConsent()))).code, "empty-output");
  assert.throws(() => createOnairSource({ ...hostedDeps(), workDir: "relative/dir" }), HostedRecordingError);
});

// ---- yt-dlp: configurable binary, typed missing-binary, argv hygiene -----------------------------------------
test("yt-dlp binary: env override, default, bad values refused", () => {
  assert.equal(resolveYtDlpCommand({}), "yt-dlp");
  assert.equal(resolveYtDlpCommand({ LKB_YT_DLP_PATH: "" }), "yt-dlp");
  assert.equal(resolveYtDlpCommand({ LKB_YT_DLP_PATH: "C:\\tools\\yt-dlp.exe" }), "C:\\tools\\yt-dlp.exe");
  for (const bad of ["--exec=calc", " yt-dlp", "yt-dlp\n--x", "a\0b"]) {
    assert.throws(() => resolveYtDlpCommand({ LKB_YT_DLP_PATH: bad }), (e: unknown) => e instanceof YoutubeSourceError && e.code === "bad-config");
  }
  assert.equal(resolveFfmpegLocation({}), undefined);
  assert.equal(resolveFfmpegLocation({ LKB_FFMPEG_PATH: "/usr/bin/ffmpeg" }), "/usr/bin/ffmpeg");
  for (const bad of ["ffmpeg", "--exec=x", "-x"]) {
    assert.throws(() => resolveFfmpegLocation({ LKB_FFMPEG_PATH: bad }), (e: unknown) => e instanceof YoutubeSourceError && e.code === "bad-config");
  }
});

test("yt-dlp binary: configured command and ffmpeg location reach the spawn seam as-is", async () => {
  execCalls.length = 0;
  const y = buildYoutube(okExec, { ytDlpCommand: "/opt/yt-dlp", ffmpegLocation: "/opt/ffmpeg" });
  await y.fetch({ url: `https://youtu.be/${ID}`, tenantId: TENANT }, baseConsent());
  assert.equal(execCalls[0]!.cmd, "/opt/yt-dlp");
  const a = execCalls[0]!.args;
  assert.deepEqual(a.slice(a.indexOf("--ffmpeg-location"), a.indexOf("--ffmpeg-location") + 2), ["--ffmpeg-location", "/opt/ffmpeg"]);
  assert.ok(a.indexOf("--ffmpeg-location") < a.indexOf("--"));
  assert.throws(() => buildYtDlpArgs(ID, WORK, { ffmpegLocation: "--exec=x" }), YoutubeSourceError);
  assert.throws(() => buildYtDlpArgs(ID, WORK, { ffmpegLocation: "rel/ffmpeg" }), YoutubeSourceError);
});

test("yt-dlp binary: ENOENT from spawn becomes typed binary-missing; no partial doc", async () => {
  const enoent: YoutubeExec = async () => {
    throw Object.assign(new Error("spawn yt-dlp ENOENT"), { code: "ENOENT", errno: -2 });
  };
  const y = buildYoutube(enoent, { ytDlpCommand: "/nope/yt-dlp" });
  await assert.rejects(y.fetch({ url: `https://youtu.be/${ID}`, tenantId: TENANT }, baseConsent()), (e: unknown) => {
    assert.ok(e instanceof YoutubeSourceError);
    assert.equal(e.code, "binary-missing");
    assert.ok(e.message.includes("LKB_YT_DLP_PATH"));
    return true;
  });
  const other: YoutubeExec = async () => {
    throw Object.assign(new Error("spawn EACCES"), { code: "EACCES" });
  };
  await assert.rejects(buildYoutube(other).fetch({ url: `https://youtu.be/${ID}`, tenantId: TENANT }, baseConsent()), (e: unknown) => e instanceof YoutubeSourceError && e.code === "exec-failed");
  await assert.rejects(buildYoutube(okExec, { ytDlpCommand: "--exec=calc" }).fetch({ url: `https://youtu.be/${ID}`, tenantId: TENANT }, baseConsent()), (e: unknown) => e instanceof YoutubeSourceError && e.code === "bad-config");
});

test("argv hygiene: crafted URLs never spawn; a valid URL with smuggled params yields only the rebuilt URL after --", async () => {
  const crafted = [
    "--exec=calc.exe",
    `--no-playlist https://youtu.be/${ID}`,
    `https://youtu.be/--exec=calc.exe`,
    `https://youtu.be/${ID} --exec calc`,
    `https://youtu.be/${ID}\n--exec calc`,
    `-o /etc/passwd https://youtu.be/${ID}`,
    `https://www.youtube.com@evil.tld/watch?v=${ID}`,
    `http://www.youtube.com/watch?v=${ID}`,
  ];
  execCalls.length = 0;
  for (const c of crafted) {
    await assert.rejects(
      youtube.fetch({ url: c, tenantId: TENANT }, baseConsent()),
      (e: unknown) => e instanceof YoutubeSourceError && e.code === "invalid-url",
      c,
    );
  }
  assert.equal(execCalls.length, 0, "no process is spawned for a rejected URL");

  const smuggled = `https://www.youtube.com/watch?v=${ID}&--exec=touch%20pwn&x=--output%20/etc/x`;
  await youtube.fetch({ url: smuggled, tenantId: TENANT }, baseConsent());
  assert.equal(execCalls.length, 1);
  const args = execCalls[0]!.args;
  assert.equal(args[args.length - 2], "--");
  assert.equal(args[args.length - 1], `https://www.youtube.com/watch?v=${ID}`);
  assert.ok(args.every((a) => !a.includes("pwn") && !a.includes("/etc/x") && !a.includes("%20")));
  assert.equal(args.filter((a) => a === "--exec" || a.startsWith("--exec")).length, 0);
  assert.equal(args.filter((a) => a.includes(ID)).length, 2, "id appears only in the -o template and the final URL");
});

// ISS-SOURCESREG-001: pinned CURRENT behaviour, deliberately not changed by this unit (legacy slots keep precedence).
test("KNOWN (ISS-SOURCESREG-001): a strict media URL whose text ends in an audio/video extension still routes to recording", () => {
  assert.equal(route(`https://www.youtube.com/watch?v=${ID}&x=a.mp3`), "recording");
  assert.equal(route("https://zoom.us/rec/share/AbCdEf123456.mp4"), "recording");
});
