// Playwright (system Chrome, headless) live-browser check.
// Env: PW_KEY (read key), PW_KEY_RW (key with join-rules scope), WEB, OUT, PW_DIR.
// Keys are only put into localStorage; never rendered, logged or screenshotted (the Settings page is never visited).
import { pathToFileURL } from "node:url"; import fs from "node:fs"; import path from "node:path";
const { chromium } = await import(pathToFileURL(path.join(process.env.PW_DIR, "playwright/index.mjs")).href);
const WEB = process.env.WEB, OUT = process.env.OUT; fs.mkdirSync(OUT, { recursive: true });
const results = [], consoleErrors = [], external = [];
const rec = (pg, name, pass, detail = "") => { results.push({ page: pg, check: name, pass, detail: String(detail).slice(0, 400) }); console.log(pass ? "PASS" : "FAIL", pg, "-", name, detail ? "| " + String(detail).slice(0, 160) : ""); };
const browser = await chromium.launch({ channel: "chrome", headless: true });
async function ctxFor(key, label) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([k]) => { try { localStorage.setItem("lkbApiKey", k); } catch {} }, [key]);
  await ctx.route("**/*", (route) => { const u = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(u.hostname) || u.protocol === "data:" || u.protocol === "blob:") return route.continue();
    external.push(u.origin); return route.abort(); });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push({ ctx: label, url: page.url(), text: m.text().slice(0, 300) }); });
  page.on("pageerror", (e) => consoleErrors.push({ ctx: label, url: page.url(), text: "pageerror: " + String(e.message).slice(0, 300) }));
  return { ctx, page };
}
const shot = (page, n) => page.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true });
const step = async (p, name, fn) => { try { const d = await fn(); rec(p, name, true, d ?? ""); } catch (e) { rec(p, name, false, e.message.split("\n")[0]); } };

// ---------- Ask ----------
{ const { ctx, page } = await ctxFor(process.env.PW_KEY, "ask");
  await page.goto(WEB + "/ask");
  await step("Ask", "page renders heading + input", async () => { await page.getByRole("heading", { name: "Ask", exact: true }).waitFor({ timeout: 8000 }); await page.locator("#ask-query").waitFor(); });
  await shot(page, "ask-1-empty");
  await page.locator("#ask-query").fill("What did speakers say about UK student visas?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await step("Ask", "answer rendered (no error card)", async () => { await page.getByText("Answer", { exact: true }).first().waitFor({ timeout: 45000 }); const t = await page.locator("p[style*='pre-wrap']").first().innerText(); if (!t.trim()) throw new Error("empty answer"); return "answer chars=" + t.length; });
  await shot(page, "ask-2-answer");
  let link;
  await step("Ask", "internal sources listed as links to sessions", async () => { link = page.locator("a[href^='/sessions/']").first(); await link.waitFor({ timeout: 5000 }); return "n=" + await page.locator("a[href^='/sessions/']").count() + " first=" + await link.getAttribute("href"); });
  await step("Ask", "web sources listed separately from internal", async () => { const t = await page.locator("body").innerText(); if (!/web sources/i.test(t) || !/internal sources/i.test(t)) throw new Error("missing a sources heading"); });
  const bodyText = await page.locator("body").innerText();
  await step("Ask", "Ask page citation shows speaker + timestamp", async () => { const sp = /speaker/i.test(bodyText), ts = /\b\d+\s?(–|-)\s?\d+\s?s\b|\d{1,2}:\d{2}/.test(bodyText); if (!(sp && ts)) throw new Error(`speaker=${sp} timestamp=${ts} (Ask page cites sessions, not turns)`); });
  if (link) {
    await step("Ask", "citation click-through opens real session detail", async () => { await link.click(); await page.waitForURL(/\/sessions\//, { timeout: 8000 }); await page.getByRole("heading").first().waitFor({ timeout: 8000 }); await page.waitForTimeout(1500); const t = await page.locator("body").innerText(); if (/failed to load|not found/i.test(t)) throw new Error("session detail error: " + t.slice(0, 120)); return page.url(); });
    await shot(page, "ask-3-session-detail");
    await step("Ask", "session detail shows timestamped turns", async () => { const t = await page.locator("body").innerText(); const ts = /\d+s\s?(–|-)\s?\d+s|\d+:\d{2}/.test(t); if (!ts) throw new Error("no timestamps in session detail"); });
  }
  await ctx.close(); }

// ---------- Search + global bar ----------
{ const { ctx, page } = await ctxFor(process.env.PW_KEY, "search");
  await page.goto(WEB + "/sessions");
  await step("Search", "global search bar present on non-search page (role=search)", async () => { await page.getByRole("search", { name: "Global search" }).waitFor({ timeout: 8000 }); });
  await shot(page, "search-1-sessions-with-bar");
  await step("Search", "global bar submit navigates to /search?q=", async () => { await page.locator("#global-search-query").fill("visa"); await page.keyboard.press("Enter"); await page.waitForURL(/\/search\?q=visa/, { timeout: 8000 }); });
  await step("Search", "results render: session title, Speaker, time range, quote", async () => { await page.getByRole("region", { name: "Search results" }).waitFor({ timeout: 20000 }); const n = await page.locator("article.row-card").count(); if (!n) throw new Error("0 hits for 'visa'"); const t = await page.locator("article.row-card").first().innerText(); if (!/Speaker:/.test(t) || !/ s\b/.test(t)) throw new Error("missing speaker/time: " + t.slice(0, 120)); return "hits=" + n; });
  await shot(page, "search-2-results");
  await step("Search", "global bar reflects URL query on /search", async () => { const v = await page.locator("#global-search-query").inputValue(); if (v !== "visa") throw new Error("bar value=" + v); });
  await step("Search", "Open transcript citation navigates to session with turn anchor", async () => { await page.getByRole("link", { name: "Open transcript" }).first().click(); await page.waitForURL(/\/sessions\/.+#turn-/, { timeout: 8000 }); await page.waitForTimeout(1500); return "url has #turn- anchor"; });
  await shot(page, "search-3-transcript");
  await step("Search", "no-match query on the page form shows 'No passages found'", async () => { await page.goto(WEB + "/search"); await page.locator("#transcript-search-query").fill("zzzqqqxxnomatch"); await page.getByRole("button", { name: "Search", exact: true }).click(); await page.getByText(/No passages found/).waitFor({ timeout: 15000 }); });
  await shot(page, "search-4-nohits");
  await ctx.close(); }

// ---------- Meeting bot ----------
{ const { ctx, page } = await ctxFor(process.env.PW_KEY, "meeting-bot");
  await page.goto(WEB + "/meeting-bot");
  await step("MeetingBot", "page heading renders", async () => { await page.getByRole("heading", { name: "Meeting bot", exact: true }).waitFor({ timeout: 8000 }); });
  await page.waitForTimeout(3500);
  const heads = await page.getByRole("heading", { level: 2 }).allInnerTexts();
  rec("MeetingBot", "section headings (info)", true, JSON.stringify(heads));
  await step("MeetingBot", "has operations/live, upcoming and recent/past sections", async () => { const h = heads.join("|").toLowerCase(); const need = ["operations|live", "upcoming", "recent|past|sessions"]; const miss = need.filter((re) => !new RegExp(re).test(h)); if (miss.length) throw new Error("missing: " + miss.join(", ") + " have: " + h); });
  await step("MeetingBot", "retention information visible", async () => { const t = await page.locator("body").innerText(); if (!/retention|retain|delete|purge/i.test(t)) throw new Error("no retention text on page"); });
  await step("MeetingBot", "no error alerts shown", async () => { const a = await page.getByRole("alert").allInnerTexts(); if (a.length) throw new Error("alerts: " + a.join(" / ").slice(0, 300)); });
  await shot(page, "meeting-bot-1");
  await ctx.close(); }

// ---------- Join rules ----------
{ const { ctx, page } = await ctxFor(process.env.PW_KEY_RW, "join-rules");
  await page.goto(WEB + "/join-rules");
  await step("JoinRules", "page loads rules view (heading + Rule set section)", async () => { await page.getByRole("heading", { name: "Join rules", exact: true }).waitFor({ timeout: 8000 }); await page.getByRole("region", { name: "Rule set" }).waitFor({ timeout: 8000 }); });
  await shot(page, "join-rules-1-loaded");
  await step("JoinRules", "add + edit a rule; Save enabled only when dirty", async () => { const save = page.getByRole("button", { name: "Save rules" }); if (await save.isEnabled()) throw new Error("Save enabled while clean"); await page.getByRole("button", { name: "Add rule" }).click(); await page.getByLabel("Rule 2 name").fill("browsercheck-allow"); await page.getByLabel("Rule 2 domain").fill("example.org"); if (!(await save.isEnabled())) throw new Error("Save still disabled after edit"); });
  await shot(page, "join-rules-2-edited");
  await step("JoinRules", "Save persists (success notice, reload shows rule)", async () => { await page.getByRole("button", { name: "Save rules" }).click(); await page.getByRole("status").filter({ hasText: /saved|updated/i }).first().waitFor({ timeout: 8000 }); await page.reload(); await page.getByLabel("Rule 2 name").waitFor({ timeout: 8000 }); const v = await page.getByLabel("Rule 2 name").inputValue(); if (v !== "browsercheck-allow") throw new Error("reloaded value=" + v); });
  await shot(page, "join-rules-3-after-reload");
  await step("JoinRules", "rule with no matcher is surfaced as a problem / rejected", async () => { await page.getByRole("button", { name: "Add rule" }).click(); await page.getByLabel("Rule 3 name").fill("empty-matcher"); await page.getByRole("button", { name: "Save rules" }).click(); await page.getByRole("alert").first().waitFor({ timeout: 5000 }); return (await page.getByRole("alert").first().innerText()).slice(0, 120); });
  await shot(page, "join-rules-4-invalid");
  rec("JoinRules", "412 conflict dialog", true, "N/A: no If-Match/ETag in apps/api at this HEAD; not exercised");
  await step("JoinRules", "approvals/opt-outs section renders", async () => { const sec = page.getByRole("region", { name: "Approvals and opt-outs" }); await sec.waitFor({ timeout: 5000 }); return (await sec.innerText()).slice(0, 80).replace(/\n/g, " / "); });
  await ctx.close();
  const ro = await ctxFor(process.env.PW_KEY, "join-rules-ro");
  await ro.page.goto(WEB + "/join-rules");
  await step("JoinRules", "key without join-rules scope: editor read-only", async () => { await ro.page.getByRole("heading", { name: "Join rules", exact: true }).waitFor({ timeout: 8000 }); await ro.page.waitForTimeout(1500); const t = await ro.page.locator("body").innerText(); const saveDisabled = await ro.page.getByRole("button", { name: "Save rules" }).isDisabled().catch(() => true); if (!saveDisabled) throw new Error("Save enabled without scope"); return "saveDisabled; notice=" + (t.match(/read-only|read only|permission|scope/i)?.[0] ?? "none"); });
  await shot(ro.page, "join-rules-5-readonly");
  await ro.ctx.close(); }

fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ results, consoleErrors, externalRequestsBlocked: [...new Set(external)] }, null, 2));
console.log("console errors:", consoleErrors.length, "| external origins blocked:", [...new Set(external)].length);
await browser.close();
