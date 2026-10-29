// Guard for the runtime base path (APP_BASE_PATH): an internal root-absolute href, or a raw
// window.location navigation to an app route, silently escapes the base path when the product is
// served at /knowledgebase. Internal links must be router <Link>/<NavLink> or go through
// withBasePath(). External (https://) and API-served links (API_BASE_URL) are fine.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
const FORBIDDEN: Array<[string, RegExp]> = [
  ["root-absolute href attribute", /\bhref\s*=\s*(?:"\/(?!\/)|'\/(?!\/)|\{\s*["'`]\/(?!\/))/],
  ["root-absolute src attribute", /\bsrc\s*=\s*(?:"\/(?!\/)|'\/(?!\/)|\{\s*["'`]\/(?!\/))/],
  ["root-absolute fetch", /\bfetch\(\s*["'`]\/(?!\/)/],
  ["window.location navigation", /\b(?:window\.)?location\s*(?:\.(?:href|pathname)\s*=(?!=)|\.(?:assign|replace)\()/],
  ["window.open of a root path", /\bwindow\.open\(\s*["'`]\/(?!\/)/],
  ["root-absolute css url()", /url\(\s*["']?\/(?!\/)/],
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("no hard-coded root-absolute internal links in apps/web/src", () => {
  it("scans a non-trivial number of source files", () => {
    expect(walk(SRC).length).toBeGreaterThan(50);
  });
  it("finds none", () => {
    const hits: string[] = [];
    for (const file of walk(SRC)) {
      readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
        for (const [label, re] of FORBIDDEN) if (re.test(line)) hits.push(`${file}:${i + 1} ${label}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
