// 09-rejection-histogram.mts — fix cycle 1b root cause. Usage (worktree root): tsx <this>
// Pair-level rejection histogram: every (session, outerRun, label, name) the model proposed, and the
// FIRST gate of the c1 acceptance path (b40327f) that kills it; then the same under the c1b code.
import { readFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = process.cwd(); // run from the worktree root
const E = join(ROOT, "qa/evidence/u2-4-phase3-precision-regate-2026-09-22");
// The c1 predicates are read from git (b40327f) into the OS temp dir, so this script needs no copy of old source.
const { execFileSync } = await import("node:child_process");
const { tmpdir } = await import("node:os");
const { writeFileSync } = await import("node:fs");
const { pathToFileURL } = await import("node:url");
const c1Path = join(tmpdir(), "c1-speaker-name-rules.b40327f.ts");
writeFileSync(c1Path, execFileSync("git", ["show", "b40327f:packages/index/src/pipeline/speaker-name-rules.ts"]));
const C1 = await import(pathToFileURL(c1Path).href);
const NEW = await import("../../../packages/index/src/pipeline/speaker-name-rules.ts");
const gold = JSON.parse(readFileSync(join(E, "gold-labels.json"), "utf8"));
const POS = /^spk:\d+$/;
const norm = (s: string) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const personMatch = (a0: string, g0: string | null) => { if (!g0) return false; const a = norm(a0).split(" "), g = norm(g0).split(" "); const sub = (s: string[], b: string[]) => { outer: for (let i = 0; i <= b.length - s.length; i++) { for (let k = 0; k < s.length; k++) if (b[i + k] !== s[k]) continue outer; return true; } return false; }; return sub(a, g) || sub(g, a); };
const raw = readFileSync(join(E, "raw-proposals.c1.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const groups = new Map<string, any[]>();
for (const r of raw) { const k = `${r.session}|${r.outerRun}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
const H: Record<string, Record<string, number>> = { c1: {}, c1b: {} };
const bump = (v: string, k: string) => (H[v]![k] = (H[v]![k] ?? 0) + 1);
let namedEntries = 0, unparseable = 0, calls = raw.length;
for (const [k, rows] of groups) {
  const [session] = k.split("|");
  const turns = JSON.parse(readFileSync(join(ROOT, "data/toc-migrated", session!, "turns.json"), "utf8"));
  const idx = new Map(turns.map((t: any, i: number) => [t._id, i]));
  const blocks: any[] = []; let cur: any = null;
  turns.forEach((t: any, i: number) => { const ref = t.speakerRef ?? ""; if (POS.test(ref)) { if (cur && cur.label === ref) cur.end = i; else { if (cur) blocks.push(cur); cur = { label: ref, start: i, end: i }; } } else if (cur) { blocks.push(cur); cur = null; } });
  if (cur) blocks.push(cur);
  const g: any = gold.sessions.find((s: any) => s.session === session);
  blocks.forEach((b, i) => (b.person = g.blocks.find((x: any) => x.block === i + 1)?.person ?? null));
  const labels = new Set(blocks.map((b) => b.label));
  const blockAt = (l: string, i: number) => blocks.find((b) => b.label === l && i >= b.start && i <= b.end);
  const byRun = new Map<number, any[]>();
  for (const r of rows) for (const e of r.entries) { if (e.unparseable !== undefined) { unparseable++; continue; } namedEntries++; (byRun.get(r.internalRun) ?? byRun.set(r.internalRun, []).get(r.internalRun)!).push(e); }
  const votes = new Map<string, number>();
  for (const [, ents] of byRun) { const seen = new Set<string>(); for (const e of ents) { const nm = (e.displayName ?? "").trim(); if (labels.has(e.speakerRef) && nm && NEW.looksLikeAName(nm) && !NEW.isDiscourseOnly(nm)) seen.add(`${e.speakerRef}|${nm.toLowerCase()}`); } for (const s of seen) votes.set(s, (votes.get(s) ?? 0) + 1); }
  const pairs = new Map<string, { ref: string; name: string; cited: string[]; pre: string | null }>();
  for (const [, ents] of byRun) for (const e of ents) {
    const nm = (e.displayName ?? "").trim(); const key = `${e.speakerRef}|${nm}`;
    const p = pairs.get(key) ?? { ref: e.speakerRef, name: nm, cited: [], pre: null };
    p.cited.push(...e.turnIds);
    p.pre = !nm ? "0 empty name" : !labels.has(e.speakerRef) ? "0 label not a positional label here" : POS.test(nm) ? "0 displayName is a spk:N label" : !NEW.looksLikeAName(nm) ? "0 shape (looksLikeAName)" : NEW.isDiscourseOnly(nm) ? "0 discourse-only name" : (votes.get(`${e.speakerRef}|${nm.toLowerCase()}`) ?? 0) < 2 ? "1 <2-of-3 vote" : null;
    pairs.set(key, p);
  }
  // evidence per version
  const survivors: Record<string, Map<string, { gold: boolean; turns: string[] }>> = { c1: new Map(), c1b: new Map() };
  for (const p of pairs.values()) {
    const goldTrue = blocks.some((b) => b.label === p.ref && personMatch(p.name, b.person));
    const tag = `gold=${goldTrue ? "T" : "F"}`;
    if (p.pre) { bump("c1", `${p.pre} ${tag}`); bump("c1b", `${p.pre} ${tag}`); continue; }
    // c1 (b40327f): exact id; own turn self-id, or other speaker's turn right before the label + handover
    const c1ev: string[] = []; let c1why = "";
    const real = p.cited.filter((id) => idx.has(id));
    const prefixedOnly = real.length === 0 && p.cited.some((id) => idx.has(String(id).replace(/^id:/, "")));
    for (const id of real) {
      const i = idx.get(id) as number; const t = turns[i];
      const own = t.speakerRef === p.ref && C1.citesNameAsSelfIdentification(t.text ?? "", p.name);
      const ho = !own && t.speakerRef !== p.ref && turns[i + 1]?.speakerRef === p.ref && C1.citesNameAsHandover(t.text ?? "", p.name);
      if (own || ho) c1ev.push(id);
    }
    if (c1ev.length === 0) {
      const anyHas = real.some((id) => C1.containsNameVerbatim(turns[idx.get(id) as number].text ?? "", p.name));
      const ownThird = real.some((id) => { const t = turns[idx.get(id) as number]; return t.speakerRef === p.ref && C1.containsNameVerbatim(t.text ?? "", p.name); });
      c1why = real.length === 0 ? (prefixedOnly ? "2 only 'id:'-prefixed ids (lookup miss)" : "2 fabricated ids only")
        : !anyHas ? "3 no cited turn contains the name (model cited the block it SPOKE, not the naming turn)"
        : ownThird ? "4 own turn names the name but is not a self-identification (third-party address)"
        : "5 other speaker's turn: not immediately before the label's block, or not a forward handover cue";
      bump("c1", `${c1why} ${tag}`);
    } else survivors.c1!.set(p.ref + "|" + p.name, { gold: goldTrue, turns: c1ev });
    // c1b: normalise id: prefix, locate block, derive naming turns
    const ev: string[] = [];
    for (const id0 of p.cited) {
      const i = (idx.get(id0) ?? idx.get(String(id0).replace(/^id:/, ""))) as number | undefined; if (i === undefined) continue;
      const other = turns[i].speakerRef !== p.ref;
      for (const b of [blockAt(p.ref, i), other ? blockAt(p.ref, i + 1) : undefined, other ? blockAt(p.ref, i - 1) : undefined]) {
        if (!b) continue;
        const tx = (q: number) => turns[q]?.text ?? "";
        const inb = Array.from({ length: b.end - b.start + 1 }, (_, q) => b.start + q);
        const own = inb.filter((q) => NEW.citesNameAsSelfIdentification(tx(q), p.name));
        const about = inb.some((q) => !own.includes(q) && NEW.containsNameVerbatim(tx(q), p.name));
        const got = [...own];
        if (!about) { if (turns[b.start - 1] && NEW.citesNameAsHandover(tx(b.start - 1), p.name)) got.push(b.start - 1); if (turns[b.end + 1] && NEW.citesNameAsThanks(tx(b.end + 1), p.name)) got.push(b.end + 1); }
        for (const q of got) if (!ev.includes(turns[q]._id)) ev.push(turns[q]._id);
      }
    }
    if (ev.length === 0) bump("c1b", `${c1why || "5 other"} ${tag}`.replace(/^2 only 'id:'.*? gold/, "2 id:-prefixed (now normalised) but no naming relation gold"));
    else survivors.c1b!.set(p.ref + "|" + p.name, { gold: goldTrue, turns: ev });
  }
  for (const v of ["c1", "c1b"]) {
    const s = survivors[v]!;
    const byLabel = new Map<string, number>(); for (const k2 of s.keys()) byLabel.set(k2.split("|")[0]!, (byLabel.get(k2.split("|")[0]!) ?? 0) + 1);
    const turnLabels = new Map<string, Set<string>>(); for (const [k2, x] of s) for (const t of x.turns) turnLabels.set(t, (turnLabels.get(t) ?? new Set()).add(k2.split("|")[0]!));
    for (const [k2, x] of s) {
      const tag = `gold=${x.gold ? "T" : "F"}`;
      if ((byLabel.get(k2.split("|")[0]!) ?? 0) > 1) bump(v, `6 C7 label names two people (contradiction) ${tag}`);
      else if (x.turns.some((t) => (turnLabels.get(t)?.size ?? 0) > 1)) bump(v, `7 one evidence turn binds two labels ${tag}`);
      else bump(v, `8 ACCEPTED ${tag}`);
    }
  }
}
console.log(JSON.stringify({ calls, unparseable, proposalEntries: namedEntries }, null, 0));
for (const v of ["c1", "c1b"]) { console.log(`\n== ${v} (per session x outer-run x label x name) ==`); for (const [k, n] of Object.entries(H[v]!).sort()) console.log(`${String(n).padStart(5)}  ${k}`); }
