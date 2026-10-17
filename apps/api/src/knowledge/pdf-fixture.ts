/** Genuine two-page PDF for offline producer→persistence→route checks; no prebuilt evidence DTO. */
export function samplePdf(): Uint8Array {
  const streams = ["BT /F1 12 Tf 50 700 Td (Admission deadline is October.) Tj ET", "BT /F1 12 Tf 50 700 Td (Scholarships need evidence.) Tj ET"];
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>", streams[0]!,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>", streams[1]!,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let pdf = "%PDF-1.4\n"; const offsets: number[] = [];
  objects.forEach((value, i) => { offsets.push(Buffer.byteLength(pdf)); const body = i === 3 || i === 5 ? `<< /Length ${Buffer.byteLength(value)} >>\nstream\n${value}\nendstream` : value; pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf); pdf += `xref\n0 8\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf));
}
