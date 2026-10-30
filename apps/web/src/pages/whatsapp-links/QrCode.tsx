/**
 * apps/web/src/pages/whatsapp-links/QrCode.tsx -- unit wa-web (W10, gate H-9). Draws the WhatsApp pairing QR in the browser with
 * `qrcode-generator` (exact pin 2.0.4, MIT, no dependencies). The QR text is a capture credential (R-13): it is turned into SVG
 * rects in this component only, with no network, no CDN, no console output, no storage and no URL. It is not copied into any
 * attribute (the accessible name is fixed text), so it is visible nowhere in the DOM except as module geometry.
 */
import qrcode from "qrcode-generator";
import { useMemo, type ReactNode } from "react";

const QUIET = 4; // modules of white border the QR spec asks for

/** Module matrix for `value`, or null when it cannot be encoded (too long for version 40). Pure; exported for tests. */
export function qrModules(value: string): boolean[][] | null {
  try {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
  } catch {
    return null;
  }
}

export function QrCode({ value, size = 256 }: { value: string; size?: number }): ReactNode {
  const modules = useMemo(() => qrModules(value), [value]);
  if (!modules) return <p role="alert" className="error-note">The QR code could not be drawn. Reload the page.</p>;
  const n = modules.length, span = n + QUIET * 2;
  const d = modules.flatMap((row, r) => row.map((dark, c) => (dark ? `M${c + QUIET} ${r + QUIET}h1v1h-1z` : ""))).join("");
  return (
    <svg data-testid="wa-qr" role="img" aria-label="WhatsApp pairing QR code" width={size} height={size} viewBox={`0 0 ${span} ${span}`} shapeRendering="crispEdges" style={{ background: "#fff" }}>
      <rect width={span} height={span} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
