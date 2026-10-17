// Per-mutation byte backup, restore in finally + signal handlers, timeout per run, HEAD-fidelity check at the end (D-020 + 2026-09-28 amendment).
// Usage (from apps/api, node on PATH): node ../../qa/evidence/t056-answer-policy-mutation/run-mutations.mjs [green]
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

const lane = path.resolve(process.cwd(), "..", "..");
const ev = path.join(lane, "apps/api/src/answer-policy/answer-evidence.ts");
const wf = path.join(lane, "apps/api/src/answer-policy/answer-workflow.ts");
const tests = ["src/answer-policy/stale-citation-refusal.test.ts"];
const wfTests = ["--test-name-pattern=changed evidence or policy cannot authorize stale|stored candidate or evidence bytes", "src/answer-policy/answer-workflow.test.ts"];
const mutations = [
  { id: "M1 drop fingerprint check", file: ev, from: "if (binding.fingerprint !== digest(binding.source) || !binding.excerpt.trim()) return false;", to: "if (!binding.excerpt.trim()) return false;", tests },
  { id: "M2 drop empty-bindings refusal", file: ev, from: "if (!bindings.length) return false;", to: "", tests },
  { id: "M3 web without verifier accepted", file: ev, from: "if (!web || !(await web(tenantId, [binding]))) return false;", to: "if (web && !(await web(tenantId, [binding]))) return false;", tests },
  { id: "M4 drop missing-session refusal", file: ev, from: "if (!session) return false;", to: "", tests },
  { id: "M5 session lookup not tenant-bound", file: ev, from: "findOne({ tenantId, _id: evidence.sessionRef as never })", to: "findOne({ _id: evidence.sessionRef as never })", tests },
  { id: "M6 WhatsApp eligibility not required", file: ev, from: "if (!source || ((source.kind === \"whatsapp-batch\" || source.kind === \"whatsapp\") && !eligibleTurn)) return false;", to: "if (!source) return false;", tests },
  { id: "M7 drop per-turn eligibility call", file: ev, from: "if (eligibleTurn && !(await eligibleTurn(tenantId, evidence.sessionRef, q.turnId, q.quote))) return false;", to: "", tests },
  { id: "M8 drop turn text hash check", file: ev, from: "|| createHash(\"sha256\").update(turn.text).digest(\"hex\") !== q.turnTextSHA256", to: "", tests },
  { id: "M9 drop turn-exists refusal", file: ev, from: "if (!rawTurn) return false;", to: "if (!rawTurn) continue;", tests },
  { id: "M10 drop empty-quotes refusal", file: ev, from: "|| !evidence.sourceQuotes.length) return false;", to: ") return false;", tests },
  { id: "M11 workflow ignores verifier", file: wf, from: "|| !(await verify(t, run.evidence))) failure(\"stale_answer\"", to: ") failure(\"stale_answer\"", tests: wfTests },
  { id: "M13 workflow ignores candidate digest", file: wf, from: "if (run.candidateDigest !== digest(run.candidate) ||", to: "if (", tests: wfTests },
  { id: "M12 workflow ignores evidence digest", file: wf, from: "|| run.evidenceDigest !== digest(run.evidence)", to: "", tests: wfTests },
];
const sha = (b) => createHash("sha256").update(b).digest("hex");
const only = process.argv[2];
function run(files) {
  const r = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "--test-timeout=60000", "--import", "tsx", ...files], { cwd: path.join(lane, "apps/api"), encoding: "utf8", timeout: 300000, killSignal: "SIGKILL" });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  return { status: r.status, timedOut: r.error?.code === "ETIMEDOUT", pass: /ℹ pass (\d+)/.exec(out)?.[1], fail: /ℹ fail (\d+)/.exec(out)?.[1], failing: [...out.matchAll(/^✖ (.+?) \(/gm)].map((m) => m[1]).slice(0, 6) };
}
const results = [];
if (only === "green") { results.push({ id: "green baseline", ...run(wfTests) }); console.log(JSON.stringify(results, null, 1)); process.exit(0); }
let current = null; // { file, bytes }
const restoreNow = () => { if (current) { writeFileSync(current.file, current.bytes); current = null; } };
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { restoreNow(); process.exit(130); });
process.on("uncaughtException", (e) => { restoreNow(); console.error(e); process.exit(2); });
for (const m of mutations) {
  const bytes = readFileSync(m.file); current = { file: m.file, bytes };
  try {
    const text = bytes.toString("utf8"), count = text.split(m.from).length - 1;
    if (count !== 1) { results.push({ id: m.id, applied: false, matches: count }); continue; }
    writeFileSync(m.file, Buffer.from(text.replace(m.from, () => m.to), "utf8"));
    const res = run(m.tests);
    results.push({ id: m.id, applied: true, killed: res.timedOut || res.status !== 0, ...res });
  } finally { restoreNow(); }
  if (sha(readFileSync(m.file)) !== sha(bytes)) { console.error("RESTORE MISMATCH", m.file); process.exit(3); }
}
const fidelity = [ev, wf].map((f) => { const rel = path.relative(lane, f).split(path.sep).join("/"); const head = execFileSync("git", ["-C", lane, "rev-parse", `HEAD:${rel}`], { encoding: "utf8" }).trim(); const now = execFileSync("git", ["-C", lane, "hash-object", f], { encoding: "utf8" }).trim(); return { file: rel, head, now, equal: head === now }; });
console.log(JSON.stringify({ results, fidelity }, null, 1));
