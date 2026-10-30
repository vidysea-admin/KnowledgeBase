import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { loadNotice, parseNotice, tryLoadNotice, NOTICE_MAX_BYTES, NOTICE_PATH_ENV, NoticeUnavailableError } from "./notice.js";

test("R-3 the version is the SHA-256 of the LF-normalised text; CRLF, a BOM and the checkout OS do not change it", () => {
  const lf = "# Notice\n\n- one\n- two\n";
  const v = createHash("sha256").update(lf, "utf8").digest("hex");
  assert.equal(parseNotice(lf).version, v);
  assert.equal(parseNotice(lf.replace(/\n/g, "\r\n")).version, v);
  assert.equal(parseNotice("﻿" + lf).version, v);
  assert.equal(parseNotice(Buffer.from(lf)).version, v);
  assert.notEqual(parseNotice(lf + "x").version, v, "any wording change is a new version");
});

test("a missing, empty, blank or oversized notice is unavailable and nothing falls back to built-in text", () => {
  const dir = mkdtempSync(join(tmpdir(), "notice-")); try {
    assert.throws(() => loadNotice(join(dir, "none.md")), NoticeUnavailableError);
    for (const body of ["", "  \n\r\n ", "x".repeat(NOTICE_MAX_BYTES + 1)]) {
      const f = join(dir, "n.md"); writeFileSync(f, body);
      assert.throws(() => loadNotice(f), NoticeUnavailableError, JSON.stringify(body.slice(0, 5)));
      assert.equal(tryLoadNotice(f), null);
    }
    const ok = join(dir, "ok.md"); writeFileSync(ok, "hello\n");
    assert.equal(loadNotice(undefined, { [NOTICE_PATH_ENV]: ok }).text, "hello\n", "WHATSAPP_NOTICE_PATH overrides the repo copy");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the repo notice file loads, states what is archived, and has a stable 64-hex version", () => {
  const n = loadNotice(undefined, {});
  assert.match(n.version, /^[0-9a-f]{64}$/);
  assert.match(n.text, /WhatsApp/i);
  assert.equal(loadNotice(undefined, {}).version, n.version);
});
