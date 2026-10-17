import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createRunStateStore} from "../run-state-store/run-state-store.js";
import {createSessionControl} from "./session-control.js";

test("real-file cancellation survives reopening, isolates tenants, and requires explicit resume", () => {
  const root = mkdtempSync(join(tmpdir(), "lkb-control-"));
  try {
    const first = createSessionControl(createRunStateStore(root));
    assert.deepEqual(first.read("tenant-a", "session"), {ok:true, cancelled:false});
    assert.deepEqual(first.cancel("tenant-a", "session"), {ok:true, cancelled:true});
    const reopened = createSessionControl(createRunStateStore(root));
    assert.deepEqual(reopened.read("tenant-a", "session"), {ok:true, cancelled:true});
    assert.deepEqual(reopened.read("tenant-b", "session"), {ok:true, cancelled:false});
    assert.deepEqual(reopened.resume("tenant-b", "session"), {ok:true, cancelled:false});
    assert.deepEqual(reopened.read("tenant-a", "session"), {ok:true, cancelled:true});
    assert.deepEqual(reopened.resume("tenant-a", "session"), {ok:true, cancelled:false});
    const bytes = readdirSync(root).map(name => readFileSync(join(root, name)));
    for (const bad of ["", "../outside", "con", "bad/tenant"]) assert.equal(first.cancel(bad, "session").ok, false);
    assert.deepEqual(readdirSync(root).map(name => readFileSync(join(root, name))), bytes);
  } finally {rmSync(root, {recursive:true, force:true});}
});

test("corrupt control is refused byte-for-byte instead of overwritten by cancel or resume", () => {
  const root = mkdtempSync(join(tmpdir(), "lkb-control-corrupt-"));
  try {
    const control = createSessionControl(createRunStateStore(root));
    assert.equal(control.cancel("tenant", "session").ok, true);
    const file = join(root, readdirSync(root).find(name => name.endsWith(".run-state.json"))!);
    writeFileSync(file, "{broken");
    assert.equal(control.read("tenant", "session").ok, false);
    assert.equal(control.cancel("tenant", "session").ok, false);
    assert.equal(control.resume("tenant", "session").ok, false);
    assert.equal(readFileSync(file, "utf8"), "{broken");
  } finally {rmSync(root, {recursive:true, force:true});}
});
