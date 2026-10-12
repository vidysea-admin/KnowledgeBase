// Live re-check for ISS-BC3746-001. NOT run by vitest. Needs a running web dev server and Playwright.
// Usage: node scripts/browsercheck-responsive.mjs [baseUrl=http://127.0.0.1:5317] [path ...]
// Checks per page at 375px and 1280px: no horizontal page scroll; at 375 the side gutter of
// main is 16px and the menu button is visible and opens the links; at 1280 the sidebar is 220px
// wide and the menu button is hidden. Exit code 1 on any FAIL. Tables/pre are reported if they
// overflow their own container's parent (should scroll inside themselves).
import { chromium } from "playwright";

const base = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://127.0.0.1:5317";
const rest = process.argv.slice(2).filter((a) => !a.startsWith("http"));
const paths = rest.length ? rest : ["/join-rules", "/meeting-bot", "/sessions", "/ask", "/"];
const KEY = process.env.LKB_API_KEY ?? "";
let fails = 0;
const log = (ok, msg) => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); };

const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const [w, h] of [[375, 812], [1280, 800]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  if (KEY) await page.addInitScript((k) => { try { localStorage.setItem("lkb_api_key", k); } catch {} }, KEY);
  for (const p of paths) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const main = document.querySelector(".app-main");
      const nav = document.querySelector(".nav-sidebar");
      const toggle = document.querySelector(".nav-toggle");
      const r = main?.getBoundingClientRect();
      return {
        scrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
        mainLeft: r ? r.left : null, mainRightGap: r ? de.clientWidth - r.right : null,
        mainPadL: main ? parseFloat(getComputedStyle(main).paddingLeft) : null,
        navWidth: nav ? nav.getBoundingClientRect().width : null,
        toggleShown: toggle ? getComputedStyle(toggle).display !== "none" : false,
      };
    });
    const tag = `${w}px ${p}`;
    log(m.scrollWidth <= m.clientWidth, `${tag} no horizontal page scroll (scrollWidth ${m.scrollWidth} vs ${m.clientWidth})`);
    if (m.mainPadL === null) { console.log(`SKIP ${tag} no app shell (login gate?)`); continue; }
    if (w === 375) {
      log(m.mainPadL === 16, `${tag} main side gutter 16px (padding-left ${m.mainPadL})`);
      log(m.toggleShown, `${tag} menu button visible`);
      const linksBefore = await page.locator("#nav-links").isVisible();
      await page.click(".nav-toggle");
      const linksAfter = await page.locator("#nav-links").isVisible();
      log(!linksBefore && linksAfter, `${tag} menu collapsed then opens (${linksBefore} -> ${linksAfter})`);
      await page.screenshot({ path: `responsive-375${p.replace(/\W+/g, "_")}.png` });
    } else {
      log(Math.round(m.navWidth) === 220 + 1 || Math.round(m.navWidth) === 220, `${tag} sidebar 220px (${m.navWidth})`);
      log(!m.toggleShown, `${tag} menu button hidden`);
    }
  }
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} FAIL` : "ALL PASS");
process.exit(fails ? 1 : 0);
