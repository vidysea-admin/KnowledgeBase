import { test } from "node:test";
import assert from "node:assert/strict";
import { assessSender, type MailHeader } from "./sender-authentication.js";

const from = "no-reply@zoom.us";
// Sanitized actual receiving-provider grammar. This is not a live authentication measurement.
export const SANITIZED_ZOOM_AUTH = 'mx.google.com; dkim=pass header.i=@zoom.us header.s=sg header.b=fixture; ' +
  'spf=pass smtp.mailfrom="bounces+fixture-recipient@bounce-sg.zoom.us"; ' +
  'dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=zoom.us';
const headers = (auth: string, sender = from): MailHeader[] => [{name: "From", value: sender}, {name: "Authentication-Results", value: auth}];
const authenticated = (auth: string, sender = from) => assessSender(headers(auth, sender))?.senderAuthenticated;

test("sanitized real Zoom quoted SMTP property retains exact receiving-provider DMARC evidence", () => {
  assert.equal(authenticated(SANITIZED_ZOOM_AUTH), true);
  assert.equal(authenticated(SANITIZED_ZOOM_AUTH.replace("dmarc=pass", "dmarc=fail")), false);
  assert.equal(authenticated(SANITIZED_ZOOM_AUTH.replace("header.from=zoom.us", "header.from=evil.example")), false);
  assert.equal(authenticated(SANITIZED_ZOOM_AUTH, "no-reply@evil.example"), false);
});

test("well-formed quoted properties normalize without broadening domain alignment", () => {
  // Exact historical input retained; only its quote-refusal oracle changes after independent review.
  assert.equal(authenticated('mx.google.com; dmarc=pass header.from="ashoka.edu.in"', 'a@ashoka.edu.in'), true);
  for (const value of ['mx.google.com; dmarc=pass header.from="zoom.us"',
    'mx.google.com; dkim=pass header.i="@zoom.us"', 'mx.google.com; spf=pass smtp.mailfrom="bounce@zoom.us"'])
    assert.equal(authenticated(value), true, value);
  for (const value of ['mx.google.com; dmarc=pass header.from="mail.zoom.us"',
    'mx.google.com; dkim=pass header.i="@evil.example"', 'mx.google.com; spf=pass smtp.mailfrom="a@zoom.us@evil.example"',
    'mx.google.com; spf=pass smtp.mailfrom="a@bounce-sg.zoom.us"']) assert.equal(authenticated(value), false, value);
});

test("quoted method, result, receiver, malformed value and suffix injections refuse", () => {
  const attacks = ['"mx.google.com"; dmarc=pass header.from=zoom.us', 'mx.google.com; "dmarc"=pass header.from=zoom.us',
    'mx.google.com; dmarc="pass" header.from=zoom.us', 'mx.google.com; dmarc=pass header.from="zoom.us',
    'mx.google.com; dmarc=pass header.from=""', 'mx.google.com; dmarc=pass header.from="zoom.us"evil',
    'mx.google.com; dmarc=pass header.from="zoom.us\n"', 'mx.google.com; dmarc=pass header.from="zoom.us)"',
    'mx.google.com; dmarc=pass (header.from="evil.example") header.from=zoom.us'];
  for (const value of attacks) assert.equal(authenticated(value), false, value);
});

test("quoted and escaped semicolon text never becomes another trusted authentication method", () => {
  const attacks = ['mx.google.com; spf=fail smtp.mailfrom="evil.example; dmarc=pass header.from=zoom.us"',
    'mx.google.com; dmarc=fail header.from=evil.example reason.text="x; dmarc=pass header.from=zoom.us"',
    'mx.google.com; spf=fail smtp.mailfrom="x\\"; dmarc=pass header.from=zoom.us"',
    'mx.google.com; spf=fail smtp.mailfrom="x\\;dmarc=pass"; dkim=pass header.i=@zoom.us',
    'mx.google.com; dmarc=pass header.from="zoom.us\\"',
    'mx.google.com; dmarc=pass header.from="zoom.us\r\n"'];
  for (const value of attacks) assert.equal(authenticated(value), false, value);
});

test("quoted normalization retains duplicate-receiver and duplicate/failed DMARC refusal", () => {
  assert.equal(assessSender([...headers(SANITIZED_ZOOM_AUTH), {name: "Authentication-Results", value: SANITIZED_ZOOM_AUTH}])?.senderAuthenticated, false);
  assert.equal(authenticated(SANITIZED_ZOOM_AUTH.replace("mx.google.com", "upstream.example")), false);
  assert.equal(authenticated(SANITIZED_ZOOM_AUTH + '; dmarc=pass header.from="zoom.us"'), false);
  assert.equal(authenticated('mx.google.com; dmarc=pass header.from="zoom.us" header.from=zoom.us'), false);
  assert.equal(authenticated('mx.google.com; dkim=pass header.i="@zoom.us"; dmarc=fail header.from="zoom.us"'), false);
});
