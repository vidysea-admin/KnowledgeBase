import { describe, expect, test } from "vitest";
import { safeHttpUrl } from "./safe-url.js";

describe("safeHttpUrl", () => {
  test("accepts http and https only", () => {
    expect(safeHttpUrl("https://meet.google.com/abc-defg-hij")).toBe("https://meet.google.com/abc-defg-hij");
    expect(safeHttpUrl("http://example.com/x?y=1#z")).toBe("http://example.com/x?y=1#z");
    expect(safeHttpUrl("HTTPS://EXAMPLE.COM")).toBe("HTTPS://EXAMPLE.COM");
  });

  test.each([
    ["javascript:alert(1)"],
    [" javascript:alert(1)"],
    ["\tjavascript:alert(1)"],
    ["\njavascript:alert(1)"],
    ["JaVaScRiPt:alert(1)"],
    ["java\nscript:alert(1)"],
    ["java\tscript:alert(1)"],
    ["\u0000javascript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["vbscript:msgbox(1)"],
    ["file:///etc/passwd"],
    ["blob:https://example.com/x"],
    ["//evil.example/x"],
    ["/relative/path"],
    ["not a url"],
    [""],
    ["https://ok.example/\nx"],
    [" https://ok.example"],
    ["https://ok.example "],
  ])("rejects %j", (value) => {
    expect(safeHttpUrl(value)).toBeNull();
  });

  test("rejects non-strings", () => {
    for (const v of [undefined, null, 42, {}, ["https://a.com"]]) expect(safeHttpUrl(v)).toBeNull();
  });
});
