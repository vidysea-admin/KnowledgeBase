import { describe, expect, it } from "vitest";
import { normalizeBasePath, normalizeApiBase, readRuntimeConfig, withBasePath, resolveApiBase } from "./runtime.js";

describe("normalizeBasePath", () => {
  it.each([
    ["", ""],
    ["/", ""],
    ["  /  ", ""],
    ["/knowledgebase", "/knowledgebase"],
    ["/knowledgebase/", "/knowledgebase"],
    ["knowledgebase", "/knowledgebase"],
    ["knowledgebase/", "/knowledgebase"],
    ["//knowledgebase//", "/knowledgebase"],
    ["/a/b/", "/a/b"],
    ["/a/../b", "/a/b"],
    ["/./a", "/a"],
  ])("%j -> %j", (raw, expected) => {
    expect(normalizeBasePath(raw)).toBe(expected);
  });
  it("treats non-strings as root", () => {
    expect(normalizeBasePath(undefined)).toBe("");
    expect(normalizeBasePath(null)).toBe("");
    expect(normalizeBasePath(5)).toBe("");
  });
});

describe("normalizeApiBase", () => {
  it("empty means not configured", () => {
    expect(normalizeApiBase("")).toBe("");
    expect(normalizeApiBase("   ")).toBe("");
    expect(normalizeApiBase(undefined)).toBe("");
  });
  it("strips trailing slashes only", () => {
    expect(normalizeApiBase("https://api.example.com/")).toBe("https://api.example.com");
    expect(normalizeApiBase("/kb/api//")).toBe("/kb/api");
  });
});

describe("readRuntimeConfig", () => {
  it("defaults to root with no explicit api base when config.js is absent", () => {
    expect(readRuntimeConfig({} as Window)).toEqual({ basePath: "", apiBase: "" });
  });
  it("normalizes what config.js provided", () => {
    const win = { __LKB_CONFIG__: { basePath: "knowledgebase/", apiBase: "" } } as unknown as Window;
    expect(readRuntimeConfig(win)).toEqual({ basePath: "/knowledgebase", apiBase: "" });
  });
  it("survives a malformed config object", () => {
    expect(readRuntimeConfig({ __LKB_CONFIG__: "nope" } as unknown as Window)).toEqual({ basePath: "", apiBase: "" });
  });
});

describe("withBasePath", () => {
  it("prefixes an app route", () => {
    expect(withBasePath("/calendar", { basePath: "/knowledgebase", apiBase: "" })).toBe("/knowledgebase/calendar");
    expect(withBasePath("/calendar", { basePath: "", apiBase: "" })).toBe("/calendar");
  });
});

describe("resolveApiBase", () => {
  const root = { basePath: "", apiBase: "" };
  const kb = { basePath: "/knowledgebase", apiBase: "" };
  it("defaults to <basePath>/api", () => {
    expect(resolveApiBase({ config: kb, viteOverride: undefined, devFallback: null })).toBe("/knowledgebase/api");
    expect(resolveApiBase({ config: root, viteOverride: undefined, devFallback: null })).toBe("/api");
  });
  it("explicit runtime apiBase wins over the default", () => {
    expect(resolveApiBase({ config: { basePath: "/knowledgebase", apiBase: "https://api.example.com/" }, viteOverride: undefined, devFallback: null })).toBe("https://api.example.com");
  });
  it("VITE_API_BASE_URL stays a backward-compatible override over everything", () => {
    expect(resolveApiBase({ config: { basePath: "/knowledgebase", apiBase: "https://x" }, viteOverride: "http://localhost:3300/", devFallback: null })).toBe("http://localhost:3300");
  });
  it("without any config.js (legacy deployment) the default stays same-origin", () => {
    expect(resolveApiBase({ config: root, viteOverride: undefined, devFallback: null, configPresent: false })).toBe("");
    expect(resolveApiBase({ config: root, viteOverride: "https://x", devFallback: null, configPresent: false })).toBe("https://x");
  });
  it("dev fallback applies only when nothing is configured", () => {
    expect(resolveApiBase({ config: root, viteOverride: undefined, devFallback: "http://localhost:3300" })).toBe("http://localhost:3300");
    expect(resolveApiBase({ config: kb, viteOverride: undefined, devFallback: "http://localhost:3300" })).toBe("http://localhost:3300");
    expect(resolveApiBase({ config: { basePath: "", apiBase: "/x" }, viteOverride: undefined, devFallback: "http://localhost:3300" })).toBe("/x");
  });
});
