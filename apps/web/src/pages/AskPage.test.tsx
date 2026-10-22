/**
 * apps/web/src/pages/AskPage.test.tsx — U3.1. The `ask` API module is spied on rather than
 * `fetch`, matching how every other page test in this directory isolates its network layer
 * (BrainPage.test.tsx spies on `graphApi.loadGraph`). What is asserted here is the page's own
 * contract: that it calls the route with the trimmed query, renders the answer, and — the point
 * of the feature — keeps internal and web citations in SEPARATE, labelled lists.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { AuthProvider } from "../auth/AuthContext.js";
import { AskPage } from "./AskPage.js";
import * as askApi from "../api/ask.js";
import { ApiError } from "../api/client.js";
import type { AskResponse } from "../api/types.js";
import * as nativeApi from "../api/nativeEvidence.js";

function response(overrides: Partial<AskResponse> = {}): AskResponse {
  return {
    answer: "Applications open in October.",
    verdict: "correct",
    reason: "covered by session s1",
    scored: [],
    web_used: false,
    insufficient_coverage: false,
    sources: { internal: [{ node_id: "n1", evidence: { sessionRef: "s1" } }], web: [] },
    auditLog: [{ step: "answer" }],
    ...overrides,
  };
}

function renderPage() {
  localStorage.setItem("lkbApiKey", "test-key");
  return render(
    <AuthProvider>
      <MemoryRouter>
        <AskPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

async function submit(query: string) {
  await userEvent.type(screen.getByLabelText("Question"), query);
  await userEvent.click(screen.getByRole("button", { name: "Ask" }));
}

describe("AskPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  test.each(["document-page", "message"] as const)("native %s citation rechecks current source instead of showing a cached quote or recording link", async kind => {
    const passage = { start: 0, end: 5, sha256: "b".repeat(64) };
    const locator: nativeApi.NativeSourceLocator = kind === "document-page"
      ? { kind, documentId: "doc", sourceId: "source", documentSourceId: "body", headRevision: 1, revisionHash: "a".repeat(64), pageNumber: 4, passage }
      : { kind, sourceId: "chat", threadId: "thread", messageId: "message", revisionHash: "a".repeat(64), passage };
    vi.spyOn(askApi, "ask").mockResolvedValue(response({ sources: { internal: [{ node_id: "native", evidence: {
      sessionRef: "must-not-link", sourceQuotes: [{ id: "native-q", sourceLocator: locator, origin: kind,
        quote: "UNVERIFIED", turnId: "fake", speakerRef: "document", tStart: 0, tEnd: 5 }],
    } }], web: [] } }));
    const resolve = vi.spyOn(nativeApi, "resolveNativeEvidence").mockResolvedValue({ sourceLocator: locator, quote: "hello" });
    renderPage(); await submit("native question"); await screen.findByText("native");
    expect(screen.queryByText("UNVERIFIED")).toBeNull(); expect(screen.queryByRole("link", { name: "native" })).toBeNull();
    expect(resolve).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Open cited passage" }));
    expect(await screen.findByText("hello")).toBeInTheDocument(); expect(resolve).toHaveBeenCalledWith("test-key", locator);
    expect(document.querySelector('a[href*="must-not-link"]')).toBeNull(); expect(screen.queryByText("document · 0–5s")).toBeNull();
  });

  test("submits the trimmed query and renders the answer", async () => {
    const spy = vi.spyOn(askApi, "ask").mockResolvedValue(response());
    renderPage();
    await submit("  when do applications open?  ");

    await waitFor(() => expect(screen.getByText("Applications open in October.")).toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith("test-key", "when do applications open?");
  });

  test("cites internal and web sources in separate lists, and links an internal source to its session", async () => {
    vi.spyOn(askApi, "ask").mockResolvedValue(
      response({
        web_used: true,
        sources: {
          internal: [{ node_id: "n1", evidence: { sessionRef: "s1" } }],
          web: [{ url: "https://example.com/visas", title: "Visa rules" }],
        },
      }),
    );
    renderPage();
    await submit("visa rules?");

    await waitFor(
      () => expect(screen.getByText("Internal sources (1)")).toBeInTheDocument(),
      { timeout: 3_000 },
    );
    expect(screen.getByText("Web sources (1)")).toBeInTheDocument();

    // the internal citation is clickable through to the real session detail route
    expect(screen.getByRole("link", { name: "n1" })).toHaveAttribute("href", "/sessions/s1");
    // and the web citation is a genuine outbound link, never merged into the internal list
    expect(screen.getByRole("link", { name: "Visa rules" })).toHaveAttribute("href", "https://example.com/visas");
  });

  test("renders an internal source without a sessionRef as plain text, never as a broken link", async () => {
    vi.spyOn(askApi, "ask").mockResolvedValue(
      response({
        sources: {
          internal: [{ node_id: "unlinked-node" }],
          web: [],
        },
      }),
    );
    renderPage();
    await submit("what is unlinked?");

    await waitFor(() => expect(screen.getByText("unlinked-node")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "unlinked-node" })).toBeNull();
  });

  test("never renders a non-http(s) web source URL as a link, but still shows it", async () => {
    vi.spyOn(askApi, "ask").mockResolvedValue(
      response({
        web_used: true,
        sources: {
          internal: [],
          // Web sources come from an external provider; `WebSource` is an open index-signature
          // type, so a hostile `url` is a real input, not a hypothetical one.
          web: [
            { url: "javascript:alert(document.cookie)", title: "Totally legit" },
            { url: "data:text/html,<script>alert(1)</script>", title: "Also legit" },
            { url: "https://example.com/ok", title: "Genuine source" },
          ],
        },
      }),
    );
    renderPage();
    await submit("anything");

    await waitFor(() => expect(screen.getByText("Web sources (3)")).toBeInTheDocument());

    // the only anchor in the web list is the https one
    expect(screen.getByRole("link", { name: "Genuine source" })).toHaveAttribute("href", "https://example.com/ok");
    expect(screen.queryByRole("link", { name: "Totally legit" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Also legit" })).toBeNull();

    // but the citations are still visible as inert text -- not silently dropped
    expect(screen.getByText("Totally legit")).toBeInTheDocument();
    expect(screen.getByText("Also legit")).toBeInTheDocument();
  });

  test("surfaces insufficient coverage instead of presenting the answer as confident", async () => {
    vi.spyOn(askApi, "ask").mockResolvedValue(
      response({ verdict: "incorrect", insufficient_coverage: true, web_used: false }),
    );
    renderPage();
    await submit("something off-corpus");

    await waitFor(() =>
      expect(screen.getByText(/judged internal coverage insufficient/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/no web fallback is configured/i)).toBeInTheDocument();
  });

  test("ISS-274: distinguishes 'fallback unavailable' (reached, honestly failed) from 'no fallback configured' (never wired)", async () => {
    // Before this unit, web_used:false always meant "no tavilySearchFn was configured" -- now the
    // seam is always wired (apps/api/src/production.ts), so web_used:false can also mean "the
    // fallback was reached and failed honestly" (e.g. no TAVILY_API_KEY). ask-v2.ts records that
    // as an `ask.web_fallback_unavailable` audit entry; the page must say something DIFFERENT and
    // ACCURATE in that case, not repeat the now-false "no web fallback is configured" claim.
    vi.spyOn(askApi, "ask").mockResolvedValue(
      response({
        verdict: "incorrect",
        insufficient_coverage: true,
        web_used: false,
        auditLog: [{ step: "answer" }, { step: "web_fallback_unavailable: web fallback unavailable: TAVILY_API_KEY not configured" }],
      }),
    );
    renderPage();
    await submit("something off-corpus");

    await waitFor(() =>
      expect(screen.getByText(/judged internal coverage insufficient/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/web fallback was reached but is currently unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/no web fallback is configured/i)).toBeNull();
  });

  test("renders the API error message rather than a generic failure", async () => {
    vi.spyOn(askApi, "ask").mockRejectedValue(new ApiError(404, "no tree index built for this tenant yet"));
    renderPage();
    await submit("anything");

    await waitFor(() =>
      expect(screen.getByText("no tree index built for this tenant yet")).toBeInTheDocument(),
    );
  });

  test("does not call the route for a whitespace-only query — even when the form is SUBMITTED", async () => {
    // ISS-202 item 2. The version this replaces asserted `not.toHaveBeenCalled()` without ever
    // submitting, so it held whether or not `handleSubmit` guarded — it only ever proved the
    // button's `disabled` attribute, never `handleSubmit`'s `trimmed === ""` check. `AskPage`
    // renders a `<form onSubmit={handleSubmit}>`, so the handler is a reachable path in its own
    // right and deserves its own assertion.
    const spy = vi.spyOn(askApi, "ask").mockResolvedValue(response());
    renderPage();
    const field = screen.getByLabelText("Question");
    await userEvent.type(field, "   ");

    // The disabled button is still worth pinning — it is the affordance the user sees.
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();

    // Now actually submit. Typing "{Enter}" is NOT enough and I proved it: a browser performs
    // implicit form submission only when there is an ENABLED submit button, so with the button
    // disabled the keypress does nothing and the assertion below goes vacuous again. Removing
    // handleSubmit's `trimmed === ""` guard left the whole suite at 46/46 under that version.
    // Dispatching submit on the form is the path that actually reaches the handler.
    const form = field.closest("form");
    if (!form) throw new Error("AskPage must render its input inside a <form> for this guard to matter");
    fireEvent.submit(form);
    expect(spy).not.toHaveBeenCalled();

    // NON-VACUITY: prove the spy is reachable at all, or the assertion above proves nothing about
    // the guard — it would hold equally if `ask` were never wired to this form.
    await userEvent.clear(field);
    await userEvent.type(field, "real question{Enter}");
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalledWith(expect.anything(), "real question");
  });
});


test("exact source quotes link to actual turn anchors and preserve raw speaker/time labels", async () => {
  vi.spyOn(askApi, "ask").mockResolvedValue(response({ sources: { internal: [{ node_id: "n1", evidence: {
    sessionRef: "s1", sourceQuotes: [{ id: "q1", turnId: "s1-t1", speakerRef: "spk:0", tStart: 516, tEnd: 546,
      quote: "The class has 23 students.", origin: "speech" }] } }], web: [] } }));
  renderPage(); await submit("class size?");
  await waitFor(() => expect(screen.getByText("The class has 23 students.")).toBeInTheDocument());
  expect(screen.getByRole("link", { name: "spk:0 · 516–546s" })).toHaveAttribute("href", "/sessions/s1#turn-s1-t1");
  expect(screen.queryByText("Professor spk:0")).not.toBeInTheDocument();
});

test("shows how many sessions were excluded from answers, and nothing when none were", async () => {
  vi.spyOn(askApi, "ask").mockResolvedValue(response({ excludedSessions: 4, exclusionReasons: { "not-visible": 2, "identity-invalid": 2 } }));
  renderPage(); await submit("careers in law?");
  await waitFor(() => expect(screen.getByText("4 sessions not yet indexed and excluded from answers")).toBeInTheDocument());
});

test("no exclusion note when the response excludes no session", async () => {
  vi.spyOn(askApi, "ask").mockResolvedValue(response({ excludedSessions: 0, exclusionReasons: {} }));
  renderPage(); await submit("careers in law?");
  await waitFor(() => expect(screen.getByText("Applications open in October.")).toBeInTheDocument());
  expect(screen.queryByTestId("ask-excluded-note")).not.toBeInTheDocument();
});
