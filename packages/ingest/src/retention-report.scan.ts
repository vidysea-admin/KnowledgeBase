/**
 * Test-only source scanner for the retention dry-run report: proves by reading source that the
 * report's whole transitive import graph has no write/delete/spawn API and that every
 * `open`/`openSync` uses a LITERAL read-only flag. Any other flag (r+, w, a, x, numbers, variables,
 * expressions) or a missing flag is a violation; createWriteStream is always one.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const FORBIDDEN = /\b(unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync|rename|renameSync|writeFile|writeFileSync|appendFile|appendFileSync|truncate|truncateSync|ftruncate|ftruncateSync|copyFile|copyFileSync|mkdir|mkdirSync|symlink|symlinkSync|chmod|chown|utimes|utimesSync|createWriteStream|child_process|spawn|spawnSync|execSync|execFile|execFileSync|fork|eval)\b/;
const OPENERS = /\b(openSync|open)\s*\(/g;
const READ_ONLY_FLAG = /^(?:(["'`])r\1|(?:[\w.]*\.)?O_RDONLY)$/;

export const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
export const strip = (src: string): string => stripComments(src).replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, '""');

/** Top-level comma-split of the text after an opening parenthesis, up to its match. */
function callArgs(code: string, from: number): string[] {
  const args: string[] = [];
  let depth = 0, cur = "", quote = "";
  for (let i = from; i < code.length; i++) {
    const c = code.charAt(i);
    if (quote) { cur += c; if (c === "\\") cur += code.charAt(++i); else if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; cur += c; continue; }
    if ("([{".includes(c)) depth++;
    if (")]}".includes(c)) { if (depth === 0) break; depth--; }
    if (c === "," && depth === 0) { args.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

/** Human-readable violations for one source text (empty = clean). */
export function scanSource(src: string): string[] {
  const out: string[] = [];
  const code = stripComments(src);
  const m = FORBIDDEN.exec(strip(src));
  if (m) out.push(`forbidden API: ${m[1]}`);
  for (const o of code.matchAll(OPENERS)) {
    const flag = callArgs(code, (o.index ?? 0) + o[0].length)[1];
    if (flag === undefined) out.push(`${o[1]}() without an explicit read-only flag`);
    else if (!READ_ONLY_FLAG.test(flag)) out.push(`${o[1]}() flag is not a literal read-only flag: ${flag.slice(0, 40)}`);
  }
  for (const f of code.matchAll(/\bflags?\s*:\s*([^,}\n]+)/g)) {
    if (!READ_ONLY_FLAG.test((f[1] ?? "").trim())) out.push(`flag option is not a literal read-only flag: ${(f[1] ?? "").trim().slice(0, 40)}`);
  }
  if (/\brequire\s*\(|\bimport\s*\(/.test(strip(src))) out.push("require() or dynamic import()");
  return out;
}

export interface Graph { files: string[]; bare: Map<string, Set<string>>; sources: Map<string, string> }

/** Follows relative imports (and `@lkb/core` into `corePolicy`) from the entry files. */
export function importGraph(entries: string[], corePolicy: string): Graph {
  const files: string[] = [];
  const bare = new Map<string, Set<string>>();
  const sources = new Map<string, string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (files.includes(file)) continue;
    files.push(file);
    const src = readFileSync(file, "utf8");
    sources.set(file, src);
    for (const m of src.matchAll(/(?:import|export)\s+(?:type\s+)?(?:([^'"]*?)\s+from\s+)?["']([^"']+)["']/g)) {
      const names = m[1] ?? "";
      const spec = m[2] as string;
      if (spec.startsWith(".")) queue.push(resolve(dirname(file), spec.replace(/\.js$/, ".ts")));
      else {
        const set = bare.get(spec) ?? new Set<string>();
        for (const n of names.replace(/[{}]/g, "").split(",").map((s) => s.trim().replace(/^type\s+/, "")).filter(Boolean)) set.add(n);
        bare.set(spec, set);
        if (spec === "@lkb/core") queue.push(corePolicy);
      }
    }
  }
  return { files, bare, sources };
}
