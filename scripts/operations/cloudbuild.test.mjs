// F0 (D-227) / qa/contracts/cloud-build-deploy.md: structural test for the repo-owned Cloud Build config.
// Proves the SHAPE of cloudbuild.yaml only (F0-C1..C4, I2). A parse test cannot prove a deploy; that is the
// operator's throwaway tagged deploy (F0-C5), see qa/manifests/f0-cloudbuild.md "Operator steps (not run)".
// No YAML library is resolvable in a fresh worktree, so a small strict parser for the block-YAML subset the file
// uses (maps, sequences, `|` blocks, plain/quoted scalars) is inlined; anything else throws.
// Run: node --test scripts/operations/cloudbuild.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const FILE = process.env.CLOUDBUILD_FILE ?? new URL("../../cloudbuild.yaml", import.meta.url);
const TRIGGER_SUBS = ["REPO_NAME", "_AR_HOSTNAME", "_AR_PROJECT_ID", "_AR_REPOSITORY", "_DEPLOY_REGION", "_SERVICE_NAME", "_TRIGGER_ID"];
const BUILTIN = ["REPO_NAME", "COMMIT_SHA", "LOCATION", "BUILD_ID", "PROJECT_ID"];
const BASE = "$_AR_HOSTNAME/$_AR_PROJECT_ID/$_AR_REPOSITORY/$REPO_NAME";
const WEB = `${BASE}/$_SERVICE_NAME-web`, API = `${BASE}/$_SERVICE_NAME`;
const FORBIDDEN_DEPLOY_FLAGS = ["--set-env-vars", "--update-env-vars", "--remove-env-vars", "--clear-env-vars", "--env-vars-file", "--set-secrets", "--update-secrets",
  "--remove-secrets", "--clear-secrets", "--to-latest", "--to-revisions", "--min", "--max", "--min-instances", "--max-instances", "--memory", "--cpu", "--port",
  "--ingress", "--service-account", "--concurrency", "--timeout", "--scaling", "--remove-containers", "--depends-on", "--command", "--args"];

// ---- minimal block-YAML parser (strict) ----
function parseYaml(text) {
  const raw = text.replace(/\r\n/g, "\n").split("\n");
  const lines = raw.map((l, n) => ({ n, text: l, indent: l.length - l.trimStart().length }));
  let i = 0;
  const blank = (l) => l.text.trim() === "" || l.text.trim().startsWith("#");
  const skip = () => { while (i < lines.length && blank(lines[i])) i++; };
  const scalar = (s) => {
    s = s.trim();
    if (/^'.*'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
    if (/^".*"$/.test(s)) return JSON.parse(s);
    if (/^[[{&*!|>%@`]/.test(s)) throw new Error(`unsupported YAML scalar: ${s}`);
    if (/\s#/.test(s)) throw new Error(`inline comment unsupported: ${s}`);
    return s;
  };
  function block(literal, parent) {
    const out = []; let ind = -1;
    while (i < lines.length) {
      const l = lines[i];
      if (l.text.trim() === "") { out.push(""); i++; continue; }
      if (l.indent <= parent) break;
      if (ind < 0) ind = l.indent;
      out.push(l.text.slice(ind)); i++;
    }
    while (out.length && out[out.length - 1] === "") out.pop();
    return out.join("\n") + "\n";
  }
  function value(rest, parent, ownIndent) {
    if (rest === "|") return block(true, parent);
    if (rest !== "") return scalar(rest);
    skip();
    if (i >= lines.length || lines[i].indent <= ownIndent && !(lines[i].indent === ownIndent && lines[i].text.trimStart().startsWith("- "))) return null;
    return node(lines[i].indent);
  }
  function node(indent) {
    skip();
    return lines[i].text.trimStart().startsWith("- ") ? seq(indent) : map(indent);
  }
  function seq(indent) {
    const arr = [];
    for (skip(); i < lines.length && lines[i].indent === indent && lines[i].text.trimStart().startsWith("- "); skip()) {
      const l = lines[i], body = l.text.trimStart().slice(2);
      if (/^[A-Za-z_][\w-]*:(\s|$)/.test(body)) { // "- key: value" opens a map whose keys sit at indent+2
        lines[i] = { ...l, text: " ".repeat(indent + 2) + body, indent: indent + 2 };
        arr.push(map(indent + 2));
      } else if (body === "|") { i++; arr.push(block(true, indent)); } else { i++; arr.push(scalar(body)); }
    }
    return arr;
  }
  function map(indent) {
    const obj = {};
    for (skip(); i < lines.length && lines[i].indent === indent && !lines[i].text.trimStart().startsWith("- "); skip()) {
      const m = lines[i].text.trimStart().match(/^([A-Za-z_][\w.-]*):(?:\s+(.*))?$/);
      if (!m) throw new Error(`line ${lines[i].n + 1}: unsupported YAML: ${lines[i].text}`);
      if (m[1] in obj) throw new Error(`line ${lines[i].n + 1}: duplicate key ${m[1]}`);
      i++;
      obj[m[1]] = value((m[2] ?? "").trim(), indent, indent);
    }
    return obj;
  }
  skip();
  const doc = node(lines[i].indent);
  skip();
  if (i < lines.length) throw new Error(`line ${lines[i].n + 1}: unparsed content`);
  return doc;
}

// ---- structural analysis: returns a list of violations (empty = shape is right) ----
export function analyze(text) {
  const v = [];
  let doc;
  try { doc = parseYaml(text); } catch (e) { return [`parse: ${e.message}`]; }
  const steps = Array.isArray(doc.steps) ? doc.steps : [];
  const dockerSteps = steps.filter((s) => /cloud-builders\/docker$/.test(s.name ?? ""));
  const flat = (s) => (s.args ?? []).join(" ");
  const builds = dockerSteps.filter((s) => s.args?.[0] === "build");
  const pushes = dockerSteps.filter((s) => s.args?.[0] === "push");
  const deploys = steps.filter((s) => /\brun services update\b/.test(flat(s)) || /gcloud run services update/.test(flat(s)));

  // F0-C4 / C1: two builds, two pushes, targets web and api
  if (builds.length !== 2) v.push(`expected 2 docker build steps, found ${builds.length}`);
  const targets = builds.map((s) => s.args[s.args.indexOf("--target") + 1]).sort();
  if (targets.join() !== "api,web") v.push(`build targets must be api,web; found ${targets.join()}`);
  const imageOf = { web: WEB, api: API };
  for (const t of ["web", "api"]) {
    const b = builds.find((s) => s.args.includes("--target") && s.args[s.args.indexOf("--target") + 1] === t);
    if (!b) continue;
    const tags = b.args.flatMap((a, k) => (b.args[k - 1] === "-t" || b.args[k - 1] === "--tag" ? [a] : []));
    if (!tags.includes(`${imageOf[t]}:$COMMIT_SHA`)) v.push(`${t} build is not tagged ${imageOf[t]}:$COMMIT_SHA`);
    const extra = tags.filter((x) => x !== `${imageOf[t]}:$COMMIT_SHA`);
    const allowed = t === "api" ? [`${API}:latest`] : []; // inline trigger config applies :latest to the api image only
    for (const x of extra) if (!allowed.includes(x)) v.push(`${t} build applies a tag the inline config does not: ${x}`);
    if (!b.args.includes("TARGETARCH=amd64")) v.push(`${t} build lost build-arg TARGETARCH=amd64`);
    if (b.args[b.args.indexOf("-f") + 1] !== "Dockerfile" || b.args.at(-1) !== ".") v.push(`${t} build must be -f Dockerfile with context .`);
  }
  const apiBuild = builds.find((s) => s.args.includes("--target") && s.args[s.args.indexOf("--target") + 1] === "api");
  if (apiBuild && apiBuild.args[apiBuild.args.indexOf("--cache-from") + 1] !== `${API}:latest`) v.push("api build lost --cache-from <api>:latest");
  if (!steps.some((s) => /docker pull \S*:latest/.test(flat(s)) && /\|\|\s*exit 0/.test(flat(s)))) v.push("lost the best-effort pull of the api :latest cache source");
  if (pushes.length !== 2) v.push(`expected 2 docker push steps, found ${pushes.length}`);
  const pushed = pushes.map((s) => s.args.at(-1)).sort();
  if (pushed.join() !== [API, WEB].sort().join()) v.push(`pushes must cover the web and api repositories; found ${pushed.join()}`);
  for (const s of pushes) if (!s.args.includes("--all-tags")) v.push("push step must use --all-tags (sha and the inline :latest)");
  const imgs = Array.isArray(doc.images) ? [...doc.images].sort() : [];
  if (imgs.join() !== [`${WEB}:$COMMIT_SHA`, `${API}:$COMMIT_SHA`, `${API}:latest`].sort().join()) v.push(`images: must list web:sha, api:sha, api:latest; found ${imgs.join()}`);

  // F0-C2 / C4: exactly one deploy, two containers, nothing else changed
  if (deploys.length !== 1) v.push(`expected exactly 1 deploy step, found ${deploys.length}`);
  for (const s of deploys) {
    const script = flat(s).replace(/\\\n\s*/g, " ");
    const containers = [...script.matchAll(/--container=(\S+)/g)].map((m) => m[1]);
    if (containers.join() !== "web,api") v.push(`deploy must set containers web then api in one update; found ${containers.join() || "none"}`);
    const images = [...script.matchAll(/--container=(\S+)\s+--image="?([^"\s]+)"?/g)].map((m) => `${m[1]}=${m[2]}`);
    if (images.join() !== `web=${WEB}:$COMMIT_SHA,api=${API}:$COMMIT_SHA`) v.push(`deploy container/image pairing wrong: ${images.join()}`);
    if ((script.match(/--image=/g) ?? []).length !== 2) v.push("deploy must pass --image exactly twice");
    if ((script.match(/gcloud run services update/g) ?? []).length !== 1) v.push("deploy script must contain exactly one `gcloud run services update`");
    for (const f of FORBIDDEN_DEPLOY_FLAGS) if (new RegExp(`${f}(=|\\s|$)`).test(script)) v.push(`deploy touches ${f} (F0-C2: nothing but the two images)`);
    if (/gcloud run deploy/.test(script)) v.push("deploy must not use `run deploy`");
    const firstContainer = script.indexOf("--container=");
    for (const g of ["--region", "--update-labels", "--quiet", "--tag", "--no-traffic"]) {
      const at = script.indexOf(g);
      if (at > firstContainer && firstContainer >= 0) v.push(`${g} must precede the first --container (non-container flags go first)`);
    }
  }
  // F0-C3: substitutions
  const declared = doc.substitutions ?? {};
  // `$$` escapes (shell variables) are dropped before collecting references.
  const unescaped = text.replace(/\$\$\{?[A-Za-z_][A-Za-z0-9_]*/g, "").replace(/\$\$/g, "");
  const used = new Set([...unescaped.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
  for (const u of used) {
    if (u.startsWith("_")) {
      if (!(u in declared) && !TRIGGER_SUBS.includes(u)) v.push(`substitution ${u} is neither the trigger's nor declared with a default`);
      if (!(u in declared)) v.push(`substitution ${u} has no default in the file (needed for a trigger-less throwaway run)`);
    } else if (!BUILTIN.includes(u)) v.push(`unknown non-underscore substitution $${u}`);
  }
  for (const k of Object.keys(declared)) if (!k.startsWith("_")) v.push(`substitutions: ${k} must begin with an underscore`);
  if (doc.options?.substitutionOption !== "ALLOW_LOOSE") v.push("options.substitutionOption must be ALLOW_LOOSE (the trigger supplies substitutions beyond those used)");
  if (declared._NO_TRAFFIC !== "false" || declared._REVISION_TAG !== "") v.push("optional substitutions must default to today's behaviour (_NO_TRAFFIC 'false', _REVISION_TAG '')");
  // F0-I2: no secret values
  if (/secretEnv|availableSecrets|-----BEGIN|AIza[0-9A-Za-z_-]{20}|(password|token|secret|key)\s*[=:]\s*['"]?[A-Za-z0-9+/_-]{16,}/i.test(text)) v.push("file looks like it carries a secret value or secret wiring");
  if (/^\s*(substitutions|_[A-Z_]*KEY|.*(MONGO|API_KEY).*):\s*mongodb(\+srv)?:\/\//im.test(text)) v.push("connection string in file");
  return v;
}

const TEXT = readFileSync(FILE, "utf8");
const without = (re) => TEXT.replace(re, "");

test("cloudbuild.yaml has the contract shape (F0-C1..C4, I2)", () => {
  assert.deepEqual(analyze(TEXT), []);
});

test("parser reads the file into the expected top-level structure", () => {
  const doc = parseYaml(TEXT);
  assert.deepEqual(Object.keys(doc).sort(), ["images", "options", "steps", "substitutions", "tags"]);
  assert.ok(doc.steps.every((s) => typeof s.id === "string" && typeof s.name === "string"));
});

test("the test is not vacuous: dropping either container from the deploy goes red (F0-C4 falsification)", () => {
  const drop = {
    web: (l) => !/--container=web/.test(l) && !/^\s+--image=.*-web:/.test(l),
    api: (l) => !/--container=api/.test(l) && !/^\s+--image=.*SERVICE_NAME:\$COMMIT_SHA"$/.test(l),
  };
  for (const [t, keep] of Object.entries(drop)) {
    const dropped = TEXT.split("\n").filter(keep).join("\n");
    assert.notEqual(dropped, TEXT, `dropping ${t} changed nothing (test bug)`);
    assert.notDeepEqual(analyze(dropped), [], `dropping ${t} from the deploy must fail`);
  }
});

test("each rule has a mutation that turns it red", () => {
  const cases = {
    "single build": TEXT.replace(/  - id: BuildWeb\n[\s\S]*?(?=  - id: BuildAPI)/, ""),
    "web target lost": TEXT.replace("      - web\n", "      - api\n"),
    "new latest tag on web": TEXT.replace(`      - ${WEB}:$COMMIT_SHA\n`, `      - ${WEB}:$COMMIT_SHA\n      - -t\n      - ${WEB}:latest\n`),
    "env flag added": TEXT.replace("--quiet \\", "--quiet --set-env-vars=A=B \\"),
    "substitution without default": TEXT.replace("  _NO_TRAFFIC: 'false'\n", ""),
    "second deploy": TEXT.replace("images:\n", "  - id: X\n    name: n\n    args:\n      - gcloud run services update y\nimages:\n"),
    "secret wiring": TEXT.replace("\noptions:", "\navailableSecrets:\n  x: y\noptions:"),
    "single-container deploy": TEXT.replace(/ {10}--container=api \\\n {10}--image=.*\n/, ""),
    "flag after container": TEXT.replace(/ {10}--quiet \\\n/, "").replace("--container=web \\", "--container=web --quiet \\"),
    "unfamiliar substitution": TEXT.replace("$_DEPLOY_REGION", "$_OTHER_REGION"),
  };
  for (const [name, mutated] of Object.entries(cases)) {
    assert.notEqual(mutated, TEXT, `mutation "${name}" did not change the file (test bug)`);
    assert.notDeepEqual(analyze(mutated), [], `mutation "${name}" must be detected`);
  }
});

test("deploy script, run against a stub gcloud, passes both images and only the optional flags requested", (t) => {
  const bash = spawnSync("bash", ["-c", "echo ok"], { encoding: "utf8" });
  if (bash.status !== 0) return t.skip("bash not available");
  const doc = parseYaml(TEXT);
  const deploy = doc.steps.find((s) => /gcloud run services update/.test((s.args ?? []).join(" ")));
  const script = deploy.args[1];
  const dir = mkdtempSync(join(tmpdir(), "cb-stub-"));
  try {
    writeFileSync(join(dir, "gcloud"), '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\n');
    chmodSync(join(dir, "gcloud"), 0o755);
    const run = (subs) => {
      const all = { ...doc.substitutions, REPO_NAME: "repo", COMMIT_SHA: "abc123", LOCATION: "loc", BUILD_ID: "bid", ...subs };
      const body = script.replace(/\$\$/g, "\u0000").replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (m, k) => (k in all ? all[k] : m)).replace(/\u0000/g, "$");
      const r = spawnSync("bash", ["-c", body], { encoding: "utf8", env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}` } });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim().split("\n");
    };
    const base = run({});
    const imgs = base.filter((a) => a.startsWith("--image="));
    assert.deepEqual(base.filter((a) => a.startsWith("--container=")), ["--container=web", "--container=api"]);
    assert.equal(imgs.length, 2);
    assert.ok(imgs[0].endsWith("/vidysea-knowledgebase-web:abc123") && imgs[1].endsWith("/vidysea-knowledgebase:abc123"), imgs.join());
    assert.ok(!base.some((a) => a.startsWith("--tag") || a === "--no-traffic"), "defaults must not add tag or no-traffic");
    assert.ok(base.indexOf("--container=web") > base.indexOf("--quiet"), "non-container flags precede --container");
    const throwaway = run({ _REVISION_TAG: "f0-probe", _NO_TRAFFIC: "true" });
    assert.ok(throwaway.includes("--tag=f0-probe") && throwaway.includes("--no-traffic"));
    assert.ok(throwaway.indexOf("--tag=f0-probe") < throwaway.indexOf("--container=web"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
