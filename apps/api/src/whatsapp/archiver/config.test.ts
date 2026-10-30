import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { ArchiverConfigError, loadArchiverConfig, validateArchiverUrl } from "./config.js";

const TOKEN = "CANARY-TOKEN-" + "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
const env = (url: string | undefined, extra: Record<string, string> = {}): Record<string, string | undefined> =>
  ({ WHATSAPP_ARCHIVER_API_URL: url, WHATSAPP_ARCHIVER_API_TOKEN: TOKEN, ...extra });
const ALLOW = { WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP: "1" };

test("nothing set -> null (live screens answer archiver_api_unavailable)", () => {
  assert.equal(loadArchiverConfig({}), null);
  assert.equal(loadArchiverConfig({ WHATSAPP_ARCHIVER_API_URL: "  ", WHATSAPP_ARCHIVER_API_TOKEN: "" }), null);
});

test("half-configured deployments fail loudly, naming the setting but not a value", () => {
  assert.throws(() => loadArchiverConfig({ WHATSAPP_ARCHIVER_API_TOKEN: TOKEN }), (e: Error) => e instanceof ArchiverConfigError && /WHATSAPP_ARCHIVER_API_URL/.test(e.message) && !e.message.includes(TOKEN));
  assert.throws(() => loadArchiverConfig({ WHATSAPP_ARCHIVER_API_URL: "https://archiver.example.org" }), (e: Error) => /WHATSAPP_ARCHIVER_API_TOKEN/.test(e.message));
});

test("https origin accepted and normalised", () => {
  const cfg = loadArchiverConfig(env("https://Archiver.Example.org:8443/"))!;
  assert.equal(cfg.baseUrl, "https://archiver.example.org:8443");
  assert.equal(cfg.bearer(), `Bearer ${TOKEN}`);
});

test("token must be 32..512 printable non-space characters (no header injection)", () => {
  for (const t of ["short", "x".repeat(31), "x".repeat(513), `${"x".repeat(40)} y`, `${"x".repeat(40)}\r\nX-Evil: 1`, "é".repeat(40)])
    assert.throws(() => loadArchiverConfig({ WHATSAPP_ARCHIVER_API_URL: "https://a.example.org", WHATSAPP_ARCHIVER_API_TOKEN: t }), ArchiverConfigError, JSON.stringify(t).slice(0, 20));
});

test("URL shape: no userinfo, path, query, fragment, other schemes, whitespace or garbage", () => {
  for (const u of ["https://u:p@a.example.org", "https://a.example.org/svc", "https://a.example.org/?x=1", "https://a.example.org/#f",
    "ftp://a.example.org", "file:///etc/passwd", "javascript:alert(1)", "https://", "not a url", "https://a.example.org\n", "//a.example.org", ""])
    assert.throws(() => validateArchiverUrl(u, true), ArchiverConfigError, u);
});

test("plain http needs the explicit private flag AND a loopback/private literal or localhost", () => {
  for (const u of ["http://127.0.0.1:9000", "http://10.1.2.3", "http://172.20.0.5:80", "http://192.168.1.9", "http://100.64.0.7", "http://[::1]:9000", "http://[fd00::5]", "http://localhost:9000"]) {
    assert.throws(() => validateArchiverUrl(u, false), ArchiverConfigError, `no flag: ${u}`);
    assert.doesNotThrow(() => validateArchiverUrl(u, true), u);
  }
  for (const u of ["http://8.8.8.8", "http://archiver.example.org", "http://[2001:db8::1]", "http://172.32.0.1", "http://172.15.0.1"])
    assert.throws(() => validateArchiverUrl(u, true), ArchiverConfigError, `flag but not private: ${u}`);
});

test("flag is read from the environment and defaults off", () => {
  assert.throws(() => loadArchiverConfig(env("http://127.0.0.1:9000")), ArchiverConfigError);
  assert.equal(loadArchiverConfig(env("http://127.0.0.1:9000", ALLOW))!.allowPrivateHttp, true);
  assert.throws(() => loadArchiverConfig(env("http://127.0.0.1:9000", { WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP: "true" })), ArchiverConfigError);
});

test("cloud-metadata, link-local, unspecified, multicast and reserved ranges are refused for every scheme, flag or not", () => {
  const blocked = ["169.254.169.254", "169.254.0.1", "0.0.0.0", "0.1.2.3", "224.0.0.1", "239.255.255.250", "255.255.255.255", "240.0.0.1",
    "[::]", "[fe80::1]", "[ff02::1]", "[::ffff:169.254.169.254]", "[::ffff:a9fe:a9fe]", "[::ffff:0.0.0.0]"];
  for (const h of blocked) for (const s of ["https", "http"]) assert.throws(() => validateArchiverUrl(`${s}://${h}`, true), ArchiverConfigError, `${s}://${h}`);
});

test("alternative IP spellings are normalised before classification", () => {
  assert.throws(() => validateArchiverUrl("http://2130706433", false), ArchiverConfigError); // 127.0.0.1 as a decimal: private, needs the flag
  assert.doesNotThrow(() => validateArchiverUrl("http://2130706433", true));
  assert.throws(() => validateArchiverUrl("https://2852039166", true), ArchiverConfigError); // 169.254.169.254 as a decimal
  assert.throws(() => validateArchiverUrl("https://0xA9FEA9FE", true), ArchiverConfigError); // hex
  assert.throws(() => validateArchiverUrl("https://0251.0376.0251.0376", true), ArchiverConfigError); // octal
  assert.throws(() => validateArchiverUrl("http://[::ffff:127.0.0.1]", false), ArchiverConfigError);
  assert.doesNotThrow(() => validateArchiverUrl("http://[::ffff:127.0.0.1]", true));
});

test("https to a private literal is allowed (TLS on a private tunnel)", () => {
  assert.doesNotThrow(() => validateArchiverUrl("https://10.0.0.5:8443", false));
});

test("timeouts are bounded; defaults 10 s and 20 s", () => {
  const cfg = loadArchiverConfig(env("https://a.example.org"))!;
  assert.equal(cfg.timeoutMs, 10_000);
  assert.equal(cfg.listTimeoutMs, 20_000);
  for (const t of [0, 49, 60_001, 1.5, NaN]) assert.throws(() => loadArchiverConfig(env("https://a.example.org"), { timeoutMs: t }), ArchiverConfigError);
});

test("the token never appears in JSON, util.inspect, String() or a thrown config message; config is frozen", () => {
  const cfg = loadArchiverConfig(env("https://a.example.org"))!;
  for (const text of [JSON.stringify(cfg), inspect(cfg, { depth: 5, showHidden: true }), `${cfg}`, JSON.stringify({ cfg })]) assert.ok(!text.includes(TOKEN) && !text.includes("CANARY-TOKEN"));
  assert.ok(Object.isFrozen(cfg));
  assert.throws(() => { (cfg as unknown as { baseUrl: string }).baseUrl = "https://evil.example.org"; }, TypeError);
  try { loadArchiverConfig(env("https://u:p@a.example.org")); assert.fail("must throw"); }
  catch (e) { assert.ok(!(e as Error).message.includes("u:p") && !(e as Error).message.includes(TOKEN)); }
});
