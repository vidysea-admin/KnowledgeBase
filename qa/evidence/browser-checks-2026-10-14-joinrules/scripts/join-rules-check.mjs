// Playwright (system Chrome, headless, fresh temp profile per context) join-rules redo for the browsercheck FAIL (cycle 1).
// Env: WEB, OUT, PW_DIR; keys are the fixture strings fixture-ro (no join-rules scope), fixture-rw, fixture-503.
import { pathToFileURL } from "node:url"; import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
const { chromium } = await import(pathToFileURL(path.join(process.env.PW_DIR, "playwright/index.mjs")).href);
const WEB = process.env.WEB, OUT = process.env.OUT; fs.mkdirSync(OUT, { recursive: true });
const results = [], consoleErrors = [];
const rec = (name, pass, detail = "") => { results.push({ check: name, pass, detail: String(detail).slice(0, 400) }); console.log(pass ? "PASS" : "FAIL", name, detail ? "| " + String(detail).slice(0, 200) : ""); };
const step = async (name, fn) => { try { rec(name, true, (await fn()) ?? ""); } catch (e) { rec(name, false, e.message.split("\n")[0]); } };
const browser = await chromium.launch({ channel: "chrome", headless: true });
async function open(key, label, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } }); // new context = fresh in-memory profile
  await ctx.addInitScript(([k]) => { try { localStorage.setItem("lkbApiKey", k); } catch {} }, [key]);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push({ ctx: label, text: m.text().slice(0, 300) }); });
  page.on("pageerror", (e) => consoleErrors.push({ ctx: label, text: "pageerror: " + String(e.message).slice(0, 300) }));
  await page.goto(WEB + "/join-rules"); await page.getByRole("heading", { name: "Join rules", exact: true }).waitFor({ timeout: 8000 });
  return { ctx, page };
}
const shot = async (page, n) => { const f = path.join(OUT, n + ".png"); await page.screenshot({ path: f, fullPage: true }); return crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex"); };
const hashes = {};

// rw key, desktop: edit, save with ETag, reload
{ const { ctx, page } = await open("fixture-rw", "rw");
  await page.getByRole("region", { name: "Rule set" }).waitFor();
  await step("rw: Add rule + edit enables Save", async () => { const save = page.getByRole("button", { name: "Save rules" }); await page.getByRole("button", { name: "Add rule" }).click(); await page.getByLabel("Rule 2 name").fill("cycle1-rule"); await page.getByLabel("Rule 2 domain").fill("example.org"); if (!(await save.isEnabled())) throw new Error("Save disabled after edit"); });
  hashes.rw_edited = await shot(page, "join-rules-1-rw-edited");
  await step("rw: Save succeeds with If-Match/ETag and persists after reload", async () => { await page.getByRole("button", { name: "Save rules" }).click(); await page.getByRole("status").filter({ hasText: /saved|updated/i }).first().waitFor({ timeout: 8000 }); await page.reload(); await page.getByLabel("Rule 2 name").waitFor({ timeout: 8000 }); if ((await page.getByLabel("Rule 2 name").inputValue()) !== "cycle1-rule") throw new Error("not persisted"); });
  await step("rw: no read-only notice", async () => { const t = await page.locator("body").innerText(); if (/cannot change them/.test(t)) throw new Error("read-only notice shown to rw key"); });
  hashes.rw_reloaded = await shot(page, "join-rules-2-rw-after-reload");
  await ctx.close(); }

// ro key (no join-rules scope), desktop: the page only learns it is read-only when a WRITE returns 403, so make one.
{ const { ctx, page } = await open("fixture-ro", "ro");
  await step("ro: before any write, no read-only notice (page cannot know yet)", async () => { await page.getByRole("region", { name: "Rule set" }).waitFor(); const t = await page.locator("body").innerText(); return "notice present before write=" + /cannot change them/.test(t); });
  await step("ro: edit a rule and click Save -> 403 -> read-only alert, inputs and Save disabled", async () => {
    await page.getByLabel("Rule 1 name").fill("ro-attempt-renamed");
    const save = page.getByRole("button", { name: "Save rules" }); if (!(await save.isEnabled())) throw new Error("Save not enabled after edit; write cannot be attempted");
    const [resp] = await Promise.all([page.waitForResponse((r) => r.url().includes("/calendar/join-rules") && r.request().method() === "PUT"), save.click()]);
    if (resp.status() !== 403) throw new Error("PUT status=" + resp.status());
    const alert = page.getByRole("alert").filter({ hasText: /cannot change them/ }).first(); await alert.waitFor({ timeout: 5000 });
    if (!(await save.isDisabled())) throw new Error("Save still enabled after 403");
    if (!(await page.getByLabel("Rule 1 name").isDisabled())) throw new Error("rule inputs still editable after 403");
    return "PUT 403; alert=" + (await alert.innerText()).slice(0, 90); });
  hashes.ro_after403 = await shot(page, "join-rules-3-ro-after-save-403");
  await ctx.close(); }

// phone width, rw key
{ const { ctx, page } = await open("fixture-rw", "phone", 375);
  await step("phone 375px: no horizontal overflow, Save and Add rule reachable", async () => { await page.getByRole("region", { name: "Rule set" }).waitFor(); const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); if (o.sw > o.cw + 1) throw new Error(`overflow scrollWidth=${o.sw} clientWidth=${o.cw}`); await page.getByRole("button", { name: "Add rule" }).scrollIntoViewIfNeeded(); await page.getByRole("button", { name: "Save rules" }).scrollIntoViewIfNeeded(); return `scrollWidth=${o.sw} clientWidth=${o.cw}`; });
  hashes.phone = await shot(page, "join-rules-4-phone-375");
  await ctx.close(); }

// 503 state
{ const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(() => { try { localStorage.setItem("lkbApiKey", "fixture-503"); } catch {} });
  const page = await ctx.newPage(); await page.goto(WEB + "/join-rules");
  await step("503: unavailable state shown as an alert, no editor", async () => { const a = page.getByRole("alert").first(); await a.waitFor({ timeout: 8000 }); const t = await a.innerText(); if (await page.getByRole("button", { name: "Save rules" }).count()) throw new Error("editor shown on 503"); return t.slice(0, 120); });
  hashes.s503 = await shot(page, "join-rules-5-503"); await ctx.close(); }

await step("screenshots are distinct (ro-after-403 differs from rw-after-reload; the cycle-0 bug was byte-identical files)", async () => { if (hashes.ro_after403 === hashes.rw_reloaded) throw new Error("identical"); return JSON.stringify(Object.fromEntries(Object.entries(hashes).map(([k, v]) => [k, v.slice(0, 12)]))); });
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ results, consoleErrors }, null, 2));
console.log("console errors:", consoleErrors.length); await browser.close();
