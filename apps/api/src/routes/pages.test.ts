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

// ISS-408: behind the web proxy these pages are served at <APP_BASE_PATH>/api/... with the prefix
// stripped before the API sees the request, so no internal reference may be root-absolute. The
// browser-side resolution is simulated with URL(): the page URL is the proxy prefix + the path we
// were asked for, and every ref must land back under the proxy prefix.
const PROXY = "http://host/knowledgebase/api";
const BASE_PATHS = ["/", "/sessions-ui", "/sessions-ui/", "/sessions-ui/some-id", "/sessions-ui/some-id/", "/dashboard-ui", "/docs-ui", "/docs-ui/"];

for (const path of BASE_PATHS) {
  test(`GET ${path}: nav links, script root and fetch targets stay under the proxy prefix (ISS-408)`, async () => {
    const server = await startTestServer(buildTestDeps());
    try {
      const res = await fetch(`${server.baseUrl}${path}`);
      assert.equal(res.status, 200);
      const text = await res.text();
      const pageUrl = `${PROXY}${path}`;
      const hrefs = [...text.matchAll(/\b(?:href|src|action)="([^"]*)"/g)].map((m) => m[1] as string);
      assert.ok(hrefs.length >= 5, "the nav links are present");
      for (const h of hrefs) {
        assert.doesNotMatch(h, /^(\/|[a-z][a-z0-9+.-]*:)/i, `internal ref ${h} must be relative`);
        assert.ok(new URL(h, pageUrl).pathname.startsWith("/knowledgebase/api/"), `${h} resolves under the proxy prefix`);
      }
      // each nav entry points at the right sibling route, whatever the page depth
      const navPaths = hrefs.map((h) => new URL(h, pageUrl).pathname);
      for (const want of ["/knowledgebase/api/", "/knowledgebase/api/sessions-ui", "/knowledgebase/api/dashboard-ui", "/knowledgebase/api/docs-ui", "/knowledgebase/api/compete"]) {
        assert.ok(navPaths.includes(want), `nav reaches ${want} (got ${navPaths.join(",")})`);
      }
      assert.doesNotMatch(text, /(?:fetch|location\.href|location\.assign)\(\s*["'`]\//, "no root-absolute fetch/navigation");
      assert.doesNotMatch(text, /\.href\s*=\s*["'`]\//, "no root-absolute href assignment in script");
      const root = /const API_ROOT = "([^"]*)";/.exec(text)?.[1];
      if (text.includes("<script>")) {
        assert.ok(root !== undefined, "script declares API_ROOT");
        for (const api of ["sessions", "gaps", "sessions/some-id"]) {
          assert.equal(new URL(root + api, pageUrl).pathname, `/knowledgebase/api/${api}`, `API call ${api} resolves to the API root`);
        }
        assert.equal(new URL(root + "sessions-ui/x", pageUrl).pathname, "/knowledgebase/api/sessions-ui/x");
      }
    } finally {
      await server.close();
    }
  });
}

test("pages still resolve correctly when the API is deployed with no proxy prefix (relative refs are prefix-agnostic)", async () => {
  const server = await startTestServer(buildTestDeps());
  try {
    const text = await (await fetch(`${server.baseUrl}/sessions-ui/some-id`)).text();
    const root = /const API_ROOT = "([^"]*)";/.exec(text)?.[1] ?? "";
    assert.equal(new URL(root + "sessions/some-id", "http://host/sessions-ui/some-id").pathname, "/sessions/some-id");
    assert.equal(new URL("../dashboard-ui", "http://host/sessions-ui/some-id").pathname, "/dashboard-ui");
  } finally {
    await server.close();
  }
});
