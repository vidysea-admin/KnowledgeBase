import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCaptions, parseCues } from "./captions.js";

test("VTT: header, ids, NOTE, tags, entities, hour and short stamps become timestamped turns", () => {
  const vtt = `﻿WEBVTT\nKind: captions\n\nNOTE a comment\n\n1\n00:00:01.500 --> 00:00:03.000\n<c.colorE5E5E5>Hello &amp; welcome</c>\n\n2\n01:00:00.250 --> 01:00:02.000 align:start\nsecond&nbsp;part\n`;
  const turns = parseCaptions(vtt);
  assert.equal(turns.length, 2);
  assert.deepEqual(turns[0], { speakerRef: "youtube-captions", tStart: 1.5, tEnd: 3, text: "Hello & welcome" });
  assert.equal(turns[1]!.tStart, 3600.25);
  assert.equal(turns[1]!.text, "second part");
  assert.equal(parseCues("WEBVTT\n\n00:05.000 --> 00:06.000\nshort stamp\n")[0]!.start, 5);
});

test("SRT: comma milliseconds and CRLF line endings", () => {
  const srt = "1\r\n00:00:00,100 --> 00:00:01,200\r\nline one\r\n\r\n2\r\n00:00:01,300 --> 00:00:02,000\r\nline two\r\n";
  const turns = parseCaptions(srt);
  assert.equal(turns.length, 1); // adjacent cues group into one paragraph turn
  assert.equal(turns[0]!.text, "line one line two");
  assert.equal(turns[0]!.tStart, 0.1);
  assert.equal(turns[0]!.tEnd, 2);
});

test("rolling auto-captions: repeated previous line is dropped and overlap is clipped monotonic", () => {
  const vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:04.000\nfirst line\n\n00:00:02.000 --> 00:00:06.000\nfirst line\nsecond line\n\n00:00:04.000 --> 00:00:08.000\nsecond line\nthird line\n";
  const turns = parseCaptions(vtt);
  assert.equal(turns.map((t) => t.text).join("|"), "first line second line third line");
  for (const t of turns) assert.ok(t.tEnd >= t.tStart);
  const cues = parseCues(vtt);
  assert.equal(cues.length, 3);
});

test("grouping splits on a long gap and out-of-order cues are sorted", () => {
  const vtt = "WEBVTT\n\n00:00:30.000 --> 00:00:31.000\nlater\n\n00:00:00.000 --> 00:00:01.000\nearlier\n";
  const turns = parseCaptions(vtt);
  assert.deepEqual(turns.map((t) => [t.tStart, t.text]), [[0, "earlier"], [30, "later"]]);
});

test("garbage and header-only input yield no turns; an inverted cue is clamped, not negative", () => {
  assert.deepEqual(parseCaptions("WEBVTT\n\n"), []);
  assert.deepEqual(parseCaptions("not captions"), []);
  const t = parseCaptions("WEBVTT\n\n00:00:05.000 --> 00:00:04.000\ninverted\n");
  assert.equal(t[0]!.tEnd, 5);
});
