import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CaptureReadinessControls } from "./CaptureReadinessControls.js";
const auth=vi.hoisted(()=>({apiKey:"fixture-key" as string|null,sessionVersion:0}));
vi.mock("../../../auth/AuthContext.js",()=>({useAuth:()=>auth}));
const generation="11111111-2222-4333-8444-555555555555",evidenceHash="a".repeat(64);
const row={slot:"first",platform:"meet",sessionId:"sample-session",generation,evidenceHash,hostId:"b".repeat(64),observedAt:"2026-10-14T00:00:00.000Z",mediaStartedAt:1791935999000,admittedAt:1791935998000,evidenceKind:"browser"};
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
const accepted=()=>json(200,{acceptance:{id:generation,acceptedAt:"2026-10-14T00:00:01.000Z",operatorKeyId:"verified-operator",generation,evidenceHash}});
let fetchMock:ReturnType<typeof vi.fn>;
beforeEach(()=>{auth.apiKey="fixture-key";auth.sessionVersion=0;fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
async function selectSample(){await screen.findByText(/first · meet · sample-session/);fireEvent.click(screen.getByRole("radio"));}
test("review is explicit for current evidence and confirms only after host ACK then refresh",async()=>{
  let finish!:(result:Response)=>void;
  fetchMock.mockResolvedValueOnce(json(200,{observations:[row]})).mockReturnValueOnce(new Promise<Response>(r=>{finish=r;})).mockResolvedValueOnce(json(200,{observations:[row]}));
  render(<CaptureReadinessControls apiKey="fixture-key"/>);await selectSample();
  expect(screen.getByRole("button",{name:"Approve reviewed slot"})).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByRole("button",{name:"Approve reviewed slot"}));
  expect(screen.queryByText("Host confirmed your review of this capture slot.")).toBeNull();
  const [url,request]=fetchMock.mock.calls[1]!;expect(url).toContain("/capture-readiness/review");expect(request.headers.authorization).toBe("Bearer fixture-key");
  expect(JSON.parse(request.body)).toEqual({slot:"first",platform:"meet",generation,evidenceHash});
  finish(accepted());await screen.findByText("Host confirmed your review of this capture slot.");expect(fetchMock).toHaveBeenCalledTimes(3);
});
test("revocation binds selected generation/hash and stale server refusal never labels success",async()=>{
  fetchMock.mockResolvedValueOnce(json(200,{observations:[row]})).mockResolvedValueOnce(json(409,{message:"secret host path"}));
  render(<CaptureReadinessControls apiKey="fixture-key"/>);await selectSample();fireEvent.click(screen.getByRole("button",{name:"Revoke slot approval"}));
  expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({slot:"first",platform:"meet",generation,evidenceHash});
  expect(await screen.findByRole("alert")).toHaveTextContent("observation changed");expect(document.body.textContent).not.toContain("secret host path");expect(screen.queryByText(/Host confirmed revocation/)).toBeNull();
});
test("same key new login session hides prior rows and ignores old review ACK",async()=>{
  let finish!:(result:Response)=>void;
  fetchMock.mockResolvedValueOnce(json(200,{observations:[row]})).mockReturnValueOnce(new Promise<Response>(r=>{finish=r;})).mockResolvedValueOnce(json(200,{observations:[]}));
  const view=render(<CaptureReadinessControls apiKey="fixture-key"/>);await selectSample();fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByRole("button",{name:"Approve reviewed slot"}));
  auth.sessionVersion++;view.rerender(<CaptureReadinessControls apiKey="fixture-key"/>);expect(screen.queryByText(/sample-session/)).toBeNull();
  finish(accepted());await screen.findByText(/No browser observations/);expect(screen.queryByText(/Host confirmed your review/)).toBeNull();await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(3));
});
test("empty host instructs controlled sample; fixture evidence and malformed ACK are never accepted",async()=>{
  fetchMock.mockResolvedValueOnce(json(200,{observations:[]}));const empty=render(<CaptureReadinessControls apiKey="fixture-key"/>);
  expect(await screen.findByText(/authorized operator must prepare/)).toBeInTheDocument();expect(fetchMock).toHaveBeenCalledTimes(1);empty.unmount();
  fetchMock.mockReset().mockResolvedValueOnce(json(200,{observations:[{...row,evidenceKind:"fixture"}]}));const bad=render(<CaptureReadinessControls apiKey="fixture-key"/>);expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");expect(screen.queryByRole("radio")).toBeNull();bad.unmount();
  fetchMock.mockReset().mockResolvedValueOnce(json(200,{observations:[row]})).mockResolvedValueOnce(json(200,{acceptance:{generation,evidenceHash:"c".repeat(64)}}));
  render(<CaptureReadinessControls apiKey="fixture-key"/>);await selectSample();fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByRole("button",{name:"Approve reviewed slot"}));
  await screen.findByRole("alert");expect(screen.queryByText(/Host confirmed your review/)).toBeNull();expect(fetchMock).toHaveBeenCalledTimes(2);
});
