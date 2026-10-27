/**
 * scripts/qa/dockerfile-media-tool.test.mjs — the media-tool-download stage must pick its yt-dlp asset
 * even when the builder does not set TARGETARCH (Docker's legacy builder never does).
 * The RUN case expression is extracted from Dockerfile and run with `sh -eu`; nothing is downloaded
 * (the extract ends at `esac;`, before curl) and dpkg is a stub on PATH.
 * Run: node --test scripts/qa/dockerfile-media-tool.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DOCKERFILE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "Dockerfile"), "utf8").replace(/\r\n/g, "\n");

function selectionScript() {
  const lines = DOCKERFILE.slice(DOCKERFILE.indexOf("AS media-tool-download")).split("\n");
  const start = lines.findIndex((l) => l.startsWith("RUN set -eu;"));
  const end = lines.findIndex((l, i) => i > start && /^\s*esac; \\$/.test(l));
  assert.ok(start >= 0 && end > start, "media-tool-download case block not found");
  return `${lines.slice(start, end + 1).join("\n").replace(/^RUN /, "")}\necho "asset=$asset digest=$digest"\n`;
}

function run({ targetarch, dpkgArch }) {
  const stub = mkdtempSync(join(tmpdir(), "dpkg-stub-"));
  try {
    writeFileSync(join(stub, "dpkg"), `#!/bin/sh\necho ${dpkgArch}\n`);
    chmodSync(join(stub, "dpkg"), 0o755);
    const env = { ...process.env, PATH: `${stub}${delimiter}${process.env.PATH}` };
    delete env.TARGETARCH;
    if (targetarch !== undefined) env.TARGETARCH = targetarch;
    return spawnSync("sh", ["-eu", "-c", selectionScript()], { env, encoding: "utf8" });
  } finally {
    rmSync(stub, { recursive: true, force: true });
  }
}

test("TARGETARCH unset: asset is selected from dpkg --print-architecture (amd64)", () => {
  const r = run({ targetarch: undefined, dpkgArch: "amd64" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^asset=yt-dlp_linux digest=58162f9b/);
});

test("TARGETARCH unset: dpkg arm64 selects the aarch64 asset", () => {
  const r = run({ targetarch: undefined, dpkgArch: "arm64" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^asset=yt-dlp_linux_aarch64 digest=b16e4dab/);
});

test("TARGETARCH set wins over dpkg (behaviour unchanged under BuildKit)", () => {
  const r = run({ targetarch: "arm64", dpkgArch: "amd64" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^asset=yt-dlp_linux_aarch64 /);
});

test("unsupported architecture still exits 1", () => {
  const r = run({ targetarch: undefined, dpkgArch: "s390x" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unsupported media-tool architecture/);
});

test("pins unchanged: ARG TARGETARCH, sha256sum --check", () => {
  assert.match(DOCKERFILE, /FROM node:24-slim AS media-tool-download\nARG TARGETARCH\n/);
  assert.match(DOCKERFILE, /sha256sum --check -;/);
});

test("API precreates node-owned join-rules state before non-root runtime", () => {
  const apiStage = DOCKERFILE.slice(DOCKERFILE.indexOf("FROM worker-tools AS api"));
  const rootUser = apiStage.indexOf("USER root");
  const provision = apiStage.indexOf("RUN mkdir -p");
  const nodeUser = apiStage.indexOf("USER node");
  assert.ok(rootUser >= 0 && provision > rootUser && nodeUser > provision);
  const command = apiStage.slice(provision, apiStage.indexOf("\n", provision));
  assert.match(command, /^RUN mkdir -p (?:[^&]* )?\/var\/lib\/lkb\/join-rules(?: |$)/);
  assert.match(command, /\/var\/lib\/lkb\/hosting/);
  assert.match(command, /\/var\/lib\/lkb\/counsellor/);
  assert.match(command, /&& chown -R node:node \/var\/lib\/lkb$/);
});
