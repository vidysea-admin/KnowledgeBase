import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { AiUsageSummary } from "./AiUsageSummary.js";

afterEach(cleanup);
test("unknown pricing never appears as free", () => {
  render(<AiUsageSummary entries={[{ step: "answer", provider: "ollama-cloud", costUsd: 0, costStatus: "unknown" }]} />);
  expect(screen.getByLabelText("AI usage").textContent).toBe("AI cost unknown for 1 call(s).");
});
test("mixed prices display subtotal and unknown count, ignoring non-call diagnostics", () => {
  render(<AiUsageSummary entries={[{ step: "answer", provider: "cloud", costUsd: 0.0123, costStatus: "reported" },
    { step: "score", provider: "cloud", costStatus: "unknown" }, { step: "source_hydrated" }]} />);
  expect(screen.getByLabelText("AI usage").textContent).toBe("Reported AI cost subtotal: $0.0123; price unknown for 1 call(s).");
});
test("reported zero remains valid and invalid numeric amounts stay unknown", () => {
  const view = render(<AiUsageSummary entries={[{ step: "answer", provider: "local", costUsd: 0, costStatus: "reported" }]} />);
  expect(screen.getByLabelText("AI usage").textContent).toBe("Reported AI cost: $0.0000.");
  view.rerender(<AiUsageSummary entries={[{ step: "answer", provider: "cloud", costUsd: NaN }]} />);
  expect(screen.getByLabelText("AI usage").textContent).toBe("AI cost unknown for 1 call(s).");
});
test("diagnostic-only legacy audit has no fabricated call total", () => {
  render(<AiUsageSummary entries={[{ step: "source_hydrated" }]} />);
  expect(screen.queryByLabelText("AI usage")).toBeNull();
});
