import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BotPrivacyControls } from "./BotPrivacyControls.js";

const generation = "11111111-2222-4333-8444-555555555555";
const captures = (privacy = "public") => ({captures: [{sessionId: "session-one", generation, status: "recording", privacy}]});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json"}});
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);});
afterEach(() => {cleanup(); vi.unstubAllGlobals();});

test("request uses generation/action and shows private only after actual acceptance plus refreshed state", async () => {
  let finish!: (response: Response) => void;
  fetchMock.mockResolvedValueOnce(json(200, captures())).mockReturnValueOnce(new Promise<Response>(resolve => {finish = resolve;}))
    .mockResolvedValueOnce(json(200, captures("private")));
  render(<BotPrivacyControls apiKey="fixture-key" />);
  await screen.findByText(/Public capture/); fireEvent.click(screen.getByRole("button", {name: "Start private segment"}));
  expect(screen.queryByText(/Private segment active/)).toBeNull();
  const [, request] = fetchMock.mock.calls[1]!;
  expect(JSON.parse(request.body)).toEqual({generation, action: "private-start"});
  expect(request.headers.authorization).toBe("Bearer fixture-key");
  finish(json(200, {status: "accepted", action: "private-start"}));
  await screen.findByText(/Private segment active/);
  expect(await screen.findByText("Recorder confirmed the privacy request.")).toBeInTheDocument();
});

test("failed durability/unavailable recorder never labels capture private or exposes error secrets", async () => {
  fetchMock.mockResolvedValueOnce(json(200, captures())).mockResolvedValueOnce(json(503, {message: "secret-cookie and token"}));
  render(<BotPrivacyControls apiKey="fixture-key" />);
  await screen.findByText(/Public capture/); fireEvent.click(screen.getByRole("button", {name: "Start private segment"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("could not confirm privacy");
  expect(screen.queryByText(/Private segment active/)).toBeNull();
  expect(document.body.textContent).not.toContain("secret-cookie");
});

test("auth change hides prior capture immediately and late old ACK cannot update new session", async () => {
  let finish!: (response: Response) => void;
  fetchMock.mockResolvedValueOnce(json(200, captures())).mockReturnValueOnce(new Promise<Response>(resolve => {finish = resolve;}))
    .mockResolvedValueOnce(json(200, {captures: []}));
  const view = render(<BotPrivacyControls apiKey="old-key" />);
  await screen.findByText(/Public capture/); fireEvent.click(screen.getByRole("button", {name: "Start private segment"}));
  view.rerender(<BotPrivacyControls apiKey="new-key" />);
  expect(screen.queryByText("session-one")).toBeNull();
  finish(json(200, {status: "accepted", action: "private-start"}));
  await screen.findByText(/No active recorders/);
  expect(screen.queryByText("Recorder confirmed the privacy request.")).toBeNull();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
});

test("conservative clock state accurately warns entire capture is excluded", async () => {
  fetchMock.mockResolvedValueOnce(json(200,captures("conservative")))
    .mockResolvedValueOnce(json(200,{status:"accepted",action:"private-end"}))
    .mockResolvedValueOnce(json(200,captures("conservative")));
  render(<BotPrivacyControls apiKey="fixture-key" />);
  await screen.findByText(/Entire capture excluded/);
  expect(screen.getByText(/entire capture will be excluded/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"End private segment"}));
  await screen.findByText("Recorder confirmed the privacy request.");
  expect(screen.getByText(/Entire capture excluded/)).toBeInTheDocument();
  expect(screen.queryByText(/Public capture/)).toBeNull();
});
