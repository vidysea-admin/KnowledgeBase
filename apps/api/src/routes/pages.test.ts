/**
 * apps/api/src/routes/pages.test.ts — same shape as `compete-page.test.ts`-equivalent coverage
 * (folded into `compete.test.ts` there): every page loads with NO Authorization header (the
 * real bug class server.ts's comment documents — a page mounted behind auth never lets a plain
 * browser navigation reach it), and the API-docs page's content is derived from the real routing
 * tables, not a hand-written copy that could drift.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "../testUtils.js";
import { buildTestDeps } from "../fixtures.js";

const PAGES = ["/", "/sessions-ui", "/sessions-ui/some-id", "/dashboard-ui", "/docs-ui"];

for (const path of PAGES) {
  test(`GET ${path} serves HTML with no Authorization header`, async () => {
    const server = await startTestServer(buildTestDeps());
    try {
      const res = await fetch(`${server.baseUrl}${path}`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-type") ?? "", /html/);
      const text = await res.text();
      assert.match(text, /<html>/);
    } finally {
      await server.close();
    }
  });
}

test("GET /docs-ui documents webhook permission and configuration requirements", async () => {
  const server = await startTestServer(buildTestDeps());
  try {
    const res = await fetch(`${server.baseUrl}/docs-ui`);
    const text = await res.text();
    assert.match(text, /POST \/ask/);
    assert.match(text, /POST \/webhooks\/register/);
    assert.match(text, /hosting \+ webhooks/);
    assert.match(text, /201 configured; 503 unavailable/);
    assert.match(text, /admin or owner hosting role/);
    assert.match(text, /configured private hosting storage/);
    assert.doesNotMatch(text, /501 not_implemented/);
  } finally {
    await server.close();
  }
});

test("GET /sessions-ui/:id with a script-breakout id never lets </script> reach the page unescaped", async () => {
  // Real finding (2026-09-04): the route param used to be interpolated via JSON.stringify()
  // straight into the inline <script> body. JSON.stringify does NOT escape "</script>", so the
  // HTML parser (which looks for that literal byte sequence regardless of JS-string context)
  // would end the script tag early and start executing whatever followed as real markup/script.
  const server = await startTestServer(buildTestDeps());
  try {
    const maliciousId = "</script><script>window.__pwned = true;</script>";
    const res = await fetch(`${server.baseUrl}/sessions-ui/${encodeURIComponent(maliciousId)}`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.doesNotMatch(text, /<\/script><script>window\.__pwned/, "the raw payload must never appear unescaped in the response body");
    assert.match(text, /data-session-id="[^"]*&lt;\/script&gt;/, "the id must arrive HTML-escaped inside the data attribute instead");
  } finally {
    await server.close();
  }
});

test("every page's inline script never assigns innerHTML with a variable (XSS discipline)", async () => {
  const server = await startTestServer(buildTestDeps());
  try {
    for (const path of ["/sessions-ui", "/sessions-ui/x", "/dashboard-ui"]) {
      const res = await fetch(`${server.baseUrl}${path}`);
      const text = await res.text();
      assert.doesNotMatch(text, /\.innerHTML\s*=\s*[a-zA-Z]/, `${path} must not assign innerHTML from a variable`);
    }
  } finally {
    await server.close();
  }
});
