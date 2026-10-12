import { chromium } from "file:///C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import fs from "node:fs";
const BASE = process.env.BASE, OUT = process.env.OUT, MODE = process.env.MODE || "all";
fs.mkdirSync(OUT, { recursive: true });
const PAGES = ["/", "/sessions", "/ask", "/search", "/brain", "/explorer", "/graph-confidence", "/gaps", "/activity-health", "/analytics", "/join-rules", "/calendar", "/watch", "/sources", "/settings", "/jobs", "/claims", "/status", "/setup", "/ops-health", "/notifications", "/ingest", "/meeting-bot", "/whatsapp", "/sessions/s1"];
let fails = 0, total = 0; const log = [];
const check = (ok, msg) => { total++; if (!ok) fails++; const l = (ok ? "PASS " : "FAIL ") + msg; log.push(l); console.log(l); };
const now = new Date(); const soon = new Date(now.getTime() + 3600e3), later = new Date(now.getTime() + 7200e3);
const SESS = { sessions: [1, 2, 3].map(i => ({ _id: "s" + i, title: "Study in Hungary scholarship panel with very long title number " + i, date: now.toISOString(), org: "Vidysea", participants: ["Anita Verma", "Rohit Sharma"], status: { transcribe: "done", index: "done" } })) };
const GRAPH = { nodes: [{ id: "session:s1", label: "Study in Hungary", kind: "session", ref: "s1", sources: ["tree_index"] }, { id: "topic:sch", label: "Scholarships", kind: "topic", ref: "sch", sources: ["tree_index"] }, { id: "person:a", label: "Anita", kind: "person", ref: "a", sources: ["graph_edges"] }], edges: [{ source: "session:s1", target: "topic:sch", type: "session-topic", inferred: false, origin: "tree_index" }, { source: "person:a", target: "session:s1", type: "spoke_in", inferred: false, confidence: 1, origin: "graph_edges" }], stats: { sessionsTotal: 1, sessionsInGraph: 1, sessionsMissing: [], edgeSources: { treeIndex: 1, entityEdges: 1 } } };
const JR = { ruleSet: { version: 1, ownDomains: ["vidysea.com"], rules: [] }, state: { approvedSenders: ["a@example.com"], approvedDomains: [], optedOutEventIds: [] } };
const posts = [];
const mkMock = () => (route) => {
  const req = route.request(); const path = req.url().split("3399")[1].split("?")[0]; const m = req.method();
  const j = (b, s = 200, h = {}) => route.fulfill({ status: s, contentType: "application/json", headers: h, body: JSON.stringify(b) });
  if (m !== "GET") { posts.push(m + " " + path); return j({ ok: true, id: "x", jobId: "j1" }); }
  if (path === "/calendar/join-rules") return j(JR, 200, { etag: '"v1"' });
  if (path.startsWith("/sessions/")) return j({}, 404);
  const M = { "/graph": GRAPH, "/sessions": SESS, "/calendar/upcoming": { meetings: [{ id: "ev1", title: "Weekly scholarship sync", startTime: soon.toISOString(), endTime: later.toISOString(), meetingUrl: "https://meet.google.com/abc-defg-hij", organizer: "a@example.com" }] }, "/watch-state": { state: [], heartbeats: [] }, "/watched-sources": { sources: [] }, "/meeting-candidates": { candidates: [] } };
  return j(M[path] ?? {});
};
async function ctxFor(br, w, h) { const c = await br.newContext({ viewport: { width: w, height: h } }); await c.addInitScript(() => { try { localStorage.setItem("lkbApiKey", "test-key"); } catch {} }); await c.route("**://127.0.0.1:3399/**", mkMock()); return c; }
const br = await chromium.launch({ channel: "chrome", headless: true });
const dims = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
try {
  if (MODE === "all" || MODE === "sweep") for (const [w, h] of [[375, 812], [1280, 800]]) {
    const ctx = await ctxFor(br, w, h); const page = await ctx.newPage();
    for (const p of PAGES) {
      await page.goto(BASE + p, { waitUntil: "networkidle" });
      const m = await page.evaluate(() => { window.scrollTo(200, 0); const de = document.documentElement; return { sw: de.scrollWidth, cw: de.clientWidth, bw: document.body.scrollWidth, sx: window.scrollX, shell: !!document.querySelector(".app-main") }; });
      check(m.shell && m.sw <= m.cw && m.bw <= m.cw && m.sx === 0, `${w} ${p} sw=${m.sw} bw=${m.bw} cw=${m.cw} scrollX=${m.sx} shell=${m.shell}`);
      if (m.sw > m.cw) log.push("WIDE " + await page.evaluate(() => { const o = []; document.querySelectorAll(".app-main *").forEach(e => { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1) o.push(e.tagName + "." + e.className + " w=" + Math.round(r.width) + " r=" + Math.round(r.right) + " ws=" + getComputedStyle(e).whiteSpace + " " + (e.textContent || "").slice(0, 40)); }); return o.slice(0, 10).join(" | "); }));
      if (MODE === "all" || process.env.SHOTS) await page.screenshot({ path: `${OUT}/${w}_${p.replace(/\//g, "_") || "root"}.png` });
    }
    await ctx.close();
  }
  if (MODE === "all" || MODE === "dialog") {
    const ctx = await ctxFor(br, 375, 812); const page = await ctx.newPage();
    await page.goto(BASE + "/join-rules", { waitUntil: "networkidle" });
    const fit = async (tag) => { const r = await dims(page); check(r.sw <= r.cw, `join-rules 375 ${tag} scrollWidth ${r.sw} vs ${r.cw}`); };
    await fit("loaded");
    await page.getByLabel("Sender to approve").fill("newperson@example.org");
    await page.getByRole("button", { name: /Approve sender/ }).click();
    const dlg = page.getByRole("alertdialog", { name: "Confirm change" }); await dlg.waitFor();
    let bb = await dlg.boundingBox(); check(bb.x >= 0 && bb.x + bb.width <= 375, `confirm dialog inside viewport x=${bb.x} w=${bb.width}`);
    for (const nm of ["Confirm approval", "Cancel"]) { const b = await dlg.getByRole("button", { name: nm }).boundingBox(); check(b.x >= 0 && b.x + b.width <= 375, `${nm} button inside viewport (${Math.round(b.x)}+${Math.round(b.width)})`); }
    await fit("dialog open"); await page.screenshot({ path: `${OUT}/dialog_375_sender.png` });
    await dlg.getByRole("button", { name: "Confirm approval" }).click(); await page.waitForTimeout(500);
    check(posts.includes("POST /calendar/join-rules/approvals"), "confirm sends POST approvals: " + posts.join(","));
    check(await dlg.count() === 0, "dialog closes after confirm"); await fit("after confirm");
    await page.getByLabel("Domain to approve").fill("example.com");
    await page.getByRole("button", { name: /Approve domain/ }).click(); await dlg.waitFor();
    bb = await dlg.boundingBox(); check(bb.x >= 0 && bb.x + bb.width <= 375, `domain dialog inside viewport x=${bb.x} w=${bb.width}`);
    await fit("domain dialog"); await page.screenshot({ path: `${OUT}/dialog_375_domain.png` });
    await dlg.getByRole("button", { name: "Cancel" }).click(); check(await dlg.count() === 0, "cancel closes dialog");
    await page.getByLabel("Event id to opt out of").fill("ev-123");
    await page.getByRole("button", { name: /Opt out of event/ }).click(); await dlg.waitFor(); await fit("optout dialog");
    await dlg.getByRole("button", { name: "Cancel" }).click();
    await page.click(".nav-toggle"); await fit("menu open"); await page.screenshot({ path: `${OUT}/menu_375.png` });
    await page.goto(BASE + "/calendar", { waitUntil: "networkidle" });
    const ev = page.getByText("Weekly scholarship sync").first();
    if (await ev.count()) {
      await ev.click(); await page.waitForTimeout(400);
      const r = await dims(page); check(r.sw <= r.cw, `calendar 375 event selected (300px detail panel) scrollWidth ${r.sw} vs ${r.cw}`);
      await page.screenshot({ path: `${OUT}/calendar_375_selected.png` });
      const ob = page.getByRole("button", { name: /opt/i }).first();
      if (await ob.count()) { await ob.click(); await page.waitForTimeout(300); const r2 = await dims(page); check(r2.sw <= r2.cw, `calendar 375 opt-out confirm open scrollWidth ${r2.sw} vs ${r2.cw}`); await page.screenshot({ path: `${OUT}/calendar_375_optout.png` }); }
      else log.push("INFO no opt-out button found");
    } else log.push("INFO calendar event not found in grid");
    await ctx.close();
  }
  if (MODE === "all" || MODE === "a11y") {
    const ctx = await ctxFor(br, 375, 812); const page = await ctx.newPage();
    await page.goto(BASE + "/sessions", { waitUntil: "networkidle" });
    const st = () => page.evaluate(() => { const b = document.querySelector(".nav-toggle"); return { exp: b.getAttribute("aria-expanded"), vis: getComputedStyle(document.getElementById("nav-links")).display !== "none", focused: document.activeElement === b, tag: b.tagName }; });
    await page.keyboard.press("Tab");
    let s = await st(); let n = 0; while (!s.focused && n++ < 5) { await page.keyboard.press("Tab"); s = await st(); }
    check(s.focused && s.tag === "BUTTON", "Menu button reachable by Tab (extra presses " + n + ") and is a native button");
    check(s.exp === "false" && !s.vis, "initial aria-expanded=false, links hidden");
    await page.keyboard.press("Enter"); s = await st(); check(s.exp === "true" && s.vis, "Enter opens: aria-expanded=true, links visible");
    await page.keyboard.press("Space"); s = await st(); check(s.exp === "false" && !s.vis, "Space closes: aria-expanded=false");
    await page.keyboard.press("Space"); s = await st(); check(s.exp === "true", "Space opens");
    check(await page.evaluate(() => document.getElementById(document.querySelector(".nav-toggle").getAttribute("aria-controls")) !== null), "aria-controls target exists");
    await page.keyboard.press("Tab"); const f = await page.evaluate(() => document.activeElement.getAttribute("href")); check(f === "/", "Tab from open menu moves into first nav link (" + f + ")");
    const o = await page.evaluate(() => { const b = document.querySelector(".nav-toggle"); b.focus(); return getComputedStyle(b).outlineStyle + " " + getComputedStyle(b).outlineWidth; }); log.push("INFO focus outline: " + o);
    const h = await page.evaluate(() => document.querySelector(".nav-toggle").getBoundingClientRect().height); check(h >= 40, "toggle touch height " + h);
    await ctx.close();
    const c2 = await ctxFor(br, 1280, 800); const p2 = await c2.newPage(); await p2.goto(BASE + "/sessions", { waitUntil: "networkidle" });
    check(!(await p2.locator(".nav-toggle").isVisible()) && await p2.locator("#nav-links").isVisible(), "1280: toggle hidden, links visible"); await c2.close();
  }
} finally { await br.close(); }
console.log(`TOTAL ${total} FAIL ${fails}`); fs.writeFileSync(OUT + "/log.txt", log.join("\n") + `\nTOTAL ${total} FAIL ${fails}\n`);
