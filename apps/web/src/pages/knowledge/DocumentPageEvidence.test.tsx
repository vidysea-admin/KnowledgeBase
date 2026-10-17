import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DocumentPageEvidenceView } from "./DocumentPageEvidence.js";
const document = { id: "a:doc", sourceId: "a:doc", version: "a".repeat(64), title: "Admissions <script>", format: "pdf" as const, pageCount: 2, highlights: [{ id: "h", pageNumber: 2, quote: "Exact evidence.", text: "Exact evidence.", verification: "unverified" as const }] };
afterEach(cleanup);
test("actual component renders resolved page quote/source link and unverified state safely", () => {
  const pages = new Map([[2, { id: document.id, sourceId: document.sourceId, version: document.version, title: document.title, pageNumber: 2, text: "Exact evidence." }]]);
  const { container } = render(<MemoryRouter><DocumentPageEvidenceView document={document} pages={pages} /></MemoryRouter>);
  expect(screen.getByText("Exact evidence.")).toBeInTheDocument(); expect(screen.getByText(/meaning unverified/)).toBeInTheDocument();
  expect(screen.getByRole("link")).toHaveAttribute("href", "/knowledge/documents/a%3Adoc/pages/2"); expect(container.querySelector("script")).toBeNull();
});
test("component withholds quote when actual page version/source does not match", () => {
  const pages = new Map([[2, { id: document.id, sourceId: document.sourceId, version: "b".repeat(64), title: document.title, pageNumber: 2, text: "Exact evidence." }]]);
  render(<MemoryRouter><DocumentPageEvidenceView document={document} pages={pages} /></MemoryRouter>);
  expect(screen.queryByText("Exact evidence.")).toBeNull(); expect(screen.queryByRole("link")).toBeNull(); expect(screen.getByText(/1 highlights unavailable/)).toBeInTheDocument();
});
