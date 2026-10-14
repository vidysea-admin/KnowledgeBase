/**
 * install-tasks.ps1 is tested in PREVIEW mode only (the D-045 default): the script must describe the task, change nothing on the
 * machine, refuse unsafe input, and never register without -Apply. -Apply is never run here (it changes Task Scheduler).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WIN_ONLY = { skip: process.platform !== "win32" ? "install-tasks.ps1 is Windows PowerShell" : false };
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "install-tasks.ps1");
const run = (...args) => spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, ...args], { encoding: "utf8", timeout: 60_000 });
const registered = () => spawnSync("powershell", ["-NoProfile", "-Command", "(Get-ScheduledTask -TaskName 'lkb-autojoin-poller' -ErrorAction SilentlyContinue | Measure-Object).Count"], { encoding: "utf8" }).stdout.trim();

test("preview (the default) prints name, trigger, command, working directory and run-as account, and registers nothing", WIN_ONLY, () => {
  const before = registered();
  const r = run("-NodePath", process.execPath);
  assert.equal(r.status, 0, r.stderr);
  for (const needle of ["lkb-autojoin-poller", "every 5 minute", "schedule-tick", "working directory:", "run as:", "PREVIEW (nothing changed)", "IgnoreNew"]) assert.ok(r.stdout.includes(needle), needle);
  assert.ok(!/pnpm|\.cmd/.test(r.stdout), "never launched through pnpm or a .cmd shim");
  assert.equal(registered(), before, "preview must not change Task Scheduler");
});

test("-Remove without -Apply is also a preview", WIN_ONLY, () => {
  const r = run("-Remove");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(/nothing to remove|PREVIEW \(nothing changed\)/.test(r.stdout));
});

test("a bad interval or node path is refused before anything is described as installable", WIN_ONLY, () => {
  assert.notEqual(run("-IntervalMinutes", "0").status, 0);
  assert.notEqual(run("-NodePath", "C:\\definitely\\not\\here\\node.exe").status, 0);
});

test("the script source keeps the D-045 constraints: dry-run default, owned-prefix removal, no SYSTEM, no password handling", () => {
  const src = readFileSync(SCRIPT, "utf8");
  assert.match(src, /if \(-not \$Apply\)/);
  assert.match(src, /-like "\$Prefix\*"/);
  assert.match(src, /-LogonType Interactive/);
  assert.ok(!/SYSTEM|-Password|Get-Credential|Read-Host/i.test(src.replace(/never registers a SYSTEM task|no password stored|never prompts for or stores a password/gi, "")));
});
