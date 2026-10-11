import { describe, expect, test } from "vitest";
import { ApiError } from "../../api/client.js";
import { ROW_CAP, describeLoadError, formatBytes, formatInstant, platformOf, reasonLabel, safeText, sessionPath } from "./model.js";

describe("formatBytes", () => {
  test("missing or invalid size is 'unknown', never 0", () => {
    for (const v of [undefined, null, "12", NaN, Infinity, -1, {}, []]) expect(formatBytes(v)).toBe("unknown");
  });
  test("a real zero is '0 B', distinct from missing", () => { expect(formatBytes(0)).toBe("0 B"); expect(formatBytes(0)).not.toBe(formatBytes(undefined)); });
  test("unit boundaries", () => {
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1048575)).toBe("1.0 MB");
    expect(formatBytes(1048576)).toBe("1.0 MB");
    expect(formatBytes(1536 * 1024)).toBe("1.5 MB");
    expect(formatBytes(1073741824)).toBe("1.0 GB");
    expect(formatBytes(5 * 1024 ** 4)).toBe("5120.0 GB");
  });
});

describe("formatInstant", () => {
  test("invalid or wrongly typed dates give a placeholder, not the raw value", () => {
    for (const v of ["not a date", "", undefined, null, 5, {}]) expect(formatInstant(v)).toBe("time unknown");
    expect(formatInstant("<script>alert(1)</script>")).toBe("time unknown");
  });
  test("a valid instant is formatted from the parsed value", () => {
    expect(formatInstant("2026-10-12T09:30:00Z")).toBe(new Date("2026-10-12T09:30:00Z").toLocaleString());
  });
});

describe("safeText", () => {
  test("bounds length, removes bidi overrides and control characters, falls back on wrong types", () => {
    expect(safeText("x".repeat(5000), "f").length).toBeLessThanOrEqual(161);
    expect(safeText("a‮b⁦c\u0000d", "f")).not.toMatch(/[‮⁦\u0000]/);
    for (const v of [null, undefined, 5, {}, [], "   "]) expect(safeText(v, "fallback")).toBe("fallback");
  });
});

describe("sessionPath", () => {
  test("builds an internal route only from safe ids", () => {
    expect(sessionPath("s1")).toBe("/sessions/s1");
    expect(sessionPath("2026-09-25.a:b_c")).toBe("/sessions/2026-09-25.a%3Ab_c");
    for (const v of ["__proto__", "constructor", "prototype", "a/b", "../x", "a b", "", "http://evil", "javascript:alert(1)", "x".repeat(200), null, 5, {}, undefined]) {
      expect(sessionPath(v)).toBeNull();
    }
  });
});

describe("reasonLabel", () => {
  test("known vocabulary maps to a neutral label; unknown, hostile and non-string values never echo", () => {
    expect(reasonLabel("needs-registration")).toBe("needs registration");
    expect(reasonLabel("opted-out")).toBe("opt-out recorded");
    for (const v of ["<script>alert(1)</script>", "__proto__", "constructor", "made-up", 5, null, undefined, {}]) expect(reasonLabel(v)).toBe("unrecognised reason");
  });
});

describe("platformOf", () => {
  test("platform comes from the host of a safe http(s) link only", () => {
    expect(platformOf("https://meet.google.com/abc-defg-hij")).toEqual({ platform: "Google Meet", linkKnown: true });
    expect(platformOf("https://us02web.zoom.us/j/1")).toEqual({ platform: "Zoom", linkKnown: true });
    expect(platformOf("https://example.com/x")).toEqual({ platform: "other", linkKnown: true });
    expect(platformOf("https://evilzoom.us/j/1").platform).toBe("other");
  });
  test("unsafe or missing links are not known", () => {
    for (const v of ["javascript:alert(1)", "data:text/html,x", "//meet.google.com/x", " https://zoom.us/j/1", undefined, null, 5, "zoom.us/j/1"]) {
      expect(platformOf(v)).toEqual({ platform: "unknown", linkKnown: false });
    }
  });
});

describe("describeLoadError", () => {
  test("403 names the scope, 5xx/network are generic, nothing from the server message is echoed", () => {
    expect(describeLoadError(new ApiError(403, "secret detail"), "calendar", "Upcoming meetings")).toContain('"calendar" scope');
    const generic = describeLoadError(new ApiError(503, "secret detail"), "calendar", "Upcoming meetings");
    expect(generic).toBe("Upcoming meetings unavailable.");
    expect(describeLoadError(new Error("boom"), "calendar", "Upcoming meetings")).toBe("Upcoming meetings unavailable.");
  });
});

test("row cap is bounded", () => { expect(ROW_CAP).toBeGreaterThan(0); expect(ROW_CAP).toBeLessThanOrEqual(50); });
