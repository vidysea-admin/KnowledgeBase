import { render, screen } from "@testing-library/react";
import { describe, test, expect } from "vitest";
import { MeetingBotPage } from "./MeetingBotPage.js";

describe("MeetingBotPage", () => {
  // ISS-297: the page used to say "no joiner has ever actually joined a live meeting", which the
  // 2026-09-24 live Zoho run made false. It must now say what is live AND what is still missing.
  test("honestly discloses the one live joiner and its known gaps", () => {
    render(<MeetingBotPage />);
    expect(screen.queryByText(/Not live yet/)).toBeNull();
    expect(screen.queryByText(/no joiner has ever actually joined a live meeting/)).toBeNull();
    expect(screen.getByText("Browser joiner + OBS capture")).toBeInTheDocument();
    expect(screen.getByText(/no auto-reconnect yet \(T-029\)/)).toBeInTheDocument();
    expect(screen.getByText(/its capture is not\s+complete/)).toBeInTheDocument();
    expect(screen.getByText(/Vexa and system-audio\s+joiners are still tested-against-fakes stubs/)).toBeInTheDocument();
  });

  test("lists the Zoho and Cloud OnAir platforms the detector now recognises", () => {
    render(<MeetingBotPage />);
    expect(screen.getByText(/Zoho \(webinar & meeting\) \/ Google Cloud OnAir/)).toBeInTheDocument();
  });

  test("lists the real, tested building blocks without claiming they're a live connection", () => {
    render(<MeetingBotPage />);
    expect(screen.getByText("Platform detection")).toBeInTheDocument();
    expect(screen.getByText("Consent gate")).toBeInTheDocument();
    expect(screen.getByText("Join-strategy selection")).toBeInTheDocument();
    expect(screen.getByText("Private-segment exclusion")).toBeInTheDocument();
  });
});
