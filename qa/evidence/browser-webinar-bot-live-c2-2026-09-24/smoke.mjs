import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const req = createRequire("C:/Users/Lenovo/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/x.js");
const { chromium } = req("playwright-core");
const OUT = process.argv[2];
const b = await chromium.launch({ headless: true });
const page = await b.newPage();
const consoleErrors = [], pageErrors = [], failed = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("requestfailed", (r) => failed.push(r.url()));
const pages = [];
const t0 = Date.now();
const interactions = [];
await page.goto("http://127.0.0.1:5291/meeting-bot", { waitUntil: "networkidle" });
interactions.push({ action: "load /meeting-bot (unauthenticated)", sawLoginGate: /Paste your API key/.test(await page.innerText("body")) });
await page.fill("input", "smoke-placeholder-key-not-a-real-credential");
await page.click("button:has-text('Continue')");
await page.waitForLoadState("networkidle");
interactions.push({ action: "fill API-key form with a placeholder + click Continue", url: page.url() });
await page.goto("http://127.0.0.1:5291/meeting-bot", { waitUntil: "networkidle" });
interactions.push({ action: "reload /meeting-bot (key in localStorage)", url: page.url() });
const text = await page.innerText("body");
const checks = {
  noNotLiveYet: !/Not live yet/.test(text),
  noStaleNeverJoined: !/no joiner has ever actually joined a live meeting/.test(text),
  listsZohoCloudOnAir: /Zoho \(webinar & meeting\) \/ Google Cloud OnAir/.test(text),
  showsLiveJoiner: /Browser joiner \+ OBS capture/.test(text),
  disclosesNoReconnectT029: /no auto-reconnect yet \(T-029\)/.test(text),
  disclosesIncompleteCapture: /capture is not\s+complete/.test(text),
};
await page.screenshot({ path: `${OUT}/meeting-bot.png`, fullPage: true });
pages.push({ url: "/meeting-bot", h1: await page.innerText(".page-header h1"), loadMs: Date.now() - t0, checks });
// interaction: navigate away via the nav and back
const nav = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
const other = nav.find((h) => h && h !== "/meeting-bot" && h.startsWith("/"));
if (other) {
  await page.click(`a[href="${other}"]`); await page.waitForLoadState("networkidle");
  interactions.push({ action: `click nav ${other}`, url: page.url() });
  await page.click(`a[href="/meeting-bot"]`); await page.waitForLoadState("networkidle");
  interactions.push({ action: "click nav /meeting-bot", url: page.url(), h1: await page.innerText("h1") });
}
await b.close();
const report = { unit: "webinar-bot-live", fixCycle: 2, date: "2026-09-24", app: "apps/web vite dev @ http://127.0.0.1:5291 (lane worktree, no API server)",
  browser: "playwright-core chromium headless", pages, interactions, consoleErrors, pageErrors, failedRequests: failed,
  pass: Object.values(checks).every(Boolean) && pageErrors.length === 0 };
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
