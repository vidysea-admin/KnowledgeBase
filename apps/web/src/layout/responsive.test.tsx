/**
 * ISS-BC3746-001 -- the app shell had no responsive layout. jsdom has no layout engine, so these
 * pin the structure and the CSS rules; the 375/1280 px measurement is scripts/browsercheck-responsive.mjs.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, test, expect } from "vitest";
import { NavSidebar } from "./NavSidebar.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

function mobileBlock(): string {
  const i = css.indexOf("@media (max-width: 640px)");
  expect(i).toBeGreaterThan(-1);
  return css.slice(i);
}

describe("responsive app shell", () => {
  test("menu button toggles the link list (aria-expanded, data-open)", () => {
    const { container } = render(<MemoryRouter><NavSidebar /></MemoryRouter>);
    const btn = screen.getByRole("button", { name: "Menu" });
    const nav = container.querySelector("nav.nav-sidebar")!;
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(nav.getAttribute("data-open")).toBe("false");
    fireEvent.click(btn);
    expect(screen.getByRole("button", { name: "Close menu" }).getAttribute("aria-expanded")).toBe("true");
    expect(nav.getAttribute("data-open")).toBe("true");
    expect(container.querySelector("#nav-links a[href='/join-rules']")).not.toBeNull();
  });

  test("choosing a link closes the menu", () => {
    const { container } = render(<MemoryRouter><NavSidebar /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(container.querySelector("#nav-links a[href='/sessions']")!);
    expect(container.querySelector("nav")!.getAttribute("data-open")).toBe("false");
  });

  test("grid column can shrink (minmax(0,1fr)) so content cannot widen the page", () => {
    expect(css).toMatch(/\.app-shell\s*{[^}]*minmax\(0,\s*1fr\)/);
  });

  test("phone breakpoint: single column, 16px gutters, toggle shown, links collapsed", () => {
    const m = mobileBlock();
    expect(m).toMatch(/\.app-shell\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(m).toMatch(/\.app-main\s*{[^}]*padding:\s*1rem 16px/);
    expect(m).toMatch(/\.nav-sidebar\s*{[^}]*padding:\s*0\.6rem 16px/);
    expect(m).toMatch(/\.nav-toggle\s*{[^}]*display:\s*inline-block/);
    expect(m).toMatch(/\.nav-links\s*{\s*display:\s*none/);
    expect(m).toMatch(/\[data-open="true"\] \.nav-links\s*{\s*display:\s*flex/);
  });

  test("wide tables and code blocks scroll inside their own container", () => {
    expect(mobileBlock()).toMatch(/\.app-main table\s*{[^}]*overflow-x:\s*auto/);
    expect(css).toMatch(/\.app-main pre\s*{[^}]*overflow-x:\s*auto/);
  });

  test("desktop defaults unchanged: toggle hidden, 220px sidebar, 2.5rem padding outside the media block", () => {
    const desktop = css.slice(0, css.indexOf("@media (max-width: 640px)"));
    expect(desktop).toMatch(/\.nav-toggle\s*{\s*display:\s*none/);
    expect(desktop).toContain("--sidebar-w: 220px");
    expect(desktop).toMatch(/\.app-main\s*{\s*padding:\s*2rem 2\.5rem/);
  });

  test("ISS-WEBRESPONSIVE-001: selects/inputs are capped at their container so long options cannot widen the page", () => {
    expect(css).toMatch(/\.app-main select\s*{[^}]*max-width:\s*min\(100%, 40rem\)[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.app-main label\s*{\s*max-width:\s*100%/);
    expect(mobileBlock()).toMatch(/\.app-main input:not\(\[type="checkbox"\]\)[^{]*{[^}]*max-width:\s*100%/);
    expect(mobileBlock()).toMatch(/\.app-main\s*{\s*overflow-wrap:\s*anywhere/);
  });
});
