/** wa-web (W10, gate H-9): the QR is drawn client-side by an exact-pinned library; nothing about it leaves the component. */
import { cleanup, render, screen } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import pkg from "../../../package.json";
import { QrCode, qrModules } from "./QrCode.js";

const CANARY = "2@CANARY-QR-SECRET-9f3a,abc==,def==,ghi==";
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("QrCode", () => {
  test("draws an svg matrix, deterministically, with a quiet zone", () => {
    const m = qrModules(CANARY)!;
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((row) => row.length === m.length)).toBe(true);
    expect(qrModules(CANARY)).toEqual(m);
    expect(qrModules(CANARY + "x")).not.toEqual(m);
    const { container } = render(<QrCode value={CANARY} />);
    const svg = screen.getByTestId("wa-qr");
    expect(svg).toHaveAttribute("viewBox", `0 0 ${m.length + 8} ${m.length + 8}`);
    expect(container.querySelector("path")!.getAttribute("d")!.length).toBeGreaterThan(100);
  });

  test("the secret text appears nowhere in the DOM, the console, the network or storage", () => {
    const log = vi.spyOn(console, "log"), warn = vi.spyOn(console, "warn"), err = vi.spyOn(console, "error"), info = vi.spyOn(console, "info");
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const { container } = render(<QrCode value={CANARY} />);
    expect(container.innerHTML).not.toContain("CANARY");
    expect(document.body.innerHTML).not.toContain("CANARY");
    expect(JSON.stringify([...Object.entries(localStorage), ...Object.entries(sessionStorage)])).not.toContain("CANARY");
    expect(window.location.href).not.toContain("CANARY");
    expect([log, warn, err, info].flatMap((s) => s.mock.calls)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("a payload that cannot be encoded shows a plain error, not a broken image", () => {
    expect(qrModules("x".repeat(5000))).toBeNull();
    render(<QrCode value={"x".repeat(5000)} />);
    expect(screen.getByRole("alert")).toHaveTextContent("could not be drawn");
  });
});

describe("dependency pin (H-9)", () => {
  test("qrcode-generator is an exact version, MIT, with no ^ or ~", () => {
    expect((pkg.dependencies as Record<string, string>)["qrcode-generator"]).toBe("2.0.4");
    const lock = readFileSync(join(__dirname, "../../../../../pnpm-lock.yaml"), "utf8");
    expect(lock).toMatch(/qrcode-generator:\s+specifier: 2\.0\.4\s+version: 2\.0\.4/);
    expect(lock).toMatch(/qrcode-generator@2\.0\.4:\s+resolution: \{integrity: sha512-/);
  });
  test("no whatsapp-links source loads a script or image from the network", () => {
    for (const f of readdirSync(__dirname).filter((n) => /\.tsx?$/.test(n) && !/\.test\./.test(n))) {
      expect(readFileSync(join(__dirname, f), "utf8"), f).not.toMatch(/https?:\/\/(?!www\.w3\.org)|cdn\.|<script|new Image\(|createElement\(["']script/);
    }
  });
});
