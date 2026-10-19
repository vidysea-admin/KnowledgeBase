// Minimal fake DOM + fake fetch/server to execute sb_join.REGISTRATION_JS under node (no browser, no network).
// stdin: {script, instructions, action, scenario}; stdout: {result, posts, calls}
import fs from "node:fs";
const input = JSON.parse(fs.readFileSync(0, "utf8"));
const { script, instructions, action, scenario } = input;
const calls = [], posts = [];
const base = scenario.base || "http://127.0.0.1:50700";

class HTMLInputElement {
  constructor(props) { Object.assign(this, { tagName: "INPUT", type: "text", name: "", required: false, disabled: false, readOnly: false, checked: false, _v: "", attrs: {} }, props); }
  get value() { return this._v; }
  set value(v) { this._v = String(v); }
  getClientRects() { return [{}]; }
  getAttribute(n) { return this.attrs[n] ?? null; }
}
class HTMLButtonElement {
  constructor(props) { Object.assign(this, { tagName: "BUTTON", type: "submit", name: "", disabled: false, value: "", attrs: {}, formTarget: "" }, props); }
  getAttribute(n) { return this.attrs[n] ?? null; }
}
class HTMLFormElement {
  constructor() { this.elements = []; this.action = base + "/submit"; this.method = "post"; this.enctype = "application/x-www-form-urlencoded"; this.target = ""; }
  checkValidity() { calls.push("checkValidity"); scenario.onValidate && mutate(scenario.onValidate); return true; }
  submit() { calls.push("form.submit"); throw new Error("native form.submit used"); }
  requestSubmit() { calls.push("form.requestSubmit"); throw new Error("requestSubmit used"); }
}
globalThis.HTMLInputElement = HTMLInputElement; globalThis.HTMLFormElement = HTMLFormElement;
Object.defineProperty(globalThis, "FormData", { get() { calls.push("FormData"); throw new Error("FormData used (formdata event hazard)"); } });

const form = new HTMLFormElement();
const first = new HTMLInputElement({ name: "first", required: true });
const last = new HTMLInputElement({ name: "last", required: true });
const email = new HTMLInputElement({ name: "email", type: "email", required: true });
const csrf = new HTMLInputElement({ name: "csrf", type: "hidden", _v: "token" });
const button = new HTMLButtonElement({});
form.elements = [first, last, email, csrf, button];
const table = { "#registration": form, "#first": first, "#last": last, "#email": email, "button[type=submit]": button };
form.querySelectorAll = sel => (table[sel] ? [table[sel]] : []);
form.querySelector = sel => table[sel] || null;
globalThis.document = { body: { innerText: "Register" }, querySelector: () => null, querySelectorAll: sel => (table[sel] ? [table[sel]] : []) };
globalThis.location = { href: base + "/register" };

function mutate(name) {
  const evil = "http://evil.example:6666/exfil";
  if (name === "action") form.action = evil;
  else if (name === "formaction") button.attrs.formaction = evil;
  else if (name === "action-localhost") form.action = "http://localhost:50700/exfil";
  else if (name === "add-required-consent") form.elements.push(new HTMLInputElement({ type: "checkbox", required: true, name: "consent" }));
  else if (name === "check-consent") form.elements.push(new HTMLInputElement({ type: "checkbox", checked: true, name: "marketing", _v: "on" }));
  else if (name === "swap-value") first._v = "Attacker";
  else if (name === "swap-hidden") csrf._v = "stolen";
  else if (name === "add-field") form.elements.push(new HTMLInputElement({ name: "extra", _v: "injected" }));
  else throw new Error("unknown mutation " + name);
}
if (scenario.preMutate) mutate(scenario.preMutate);
if (scenario.formAction) form.action = new URL(scenario.formAction, base + "/register").href; // DOM form.action is always resolved
if (scenario.buttonFormAction) button.attrs.formaction = scenario.buttonFormAction; // raw attribute, as getAttribute returns it

// Fake server: path -> {code, location}. redirect:'error' rejects on 3xx, 'follow' re-sends the same body (307/308).
globalThis.fetch = async (url, opts) => {
  const u = new URL(url);
  posts.push({ host: u.hostname, path: u.pathname, body: opts.body, redirect: opts.redirect, credentials: opts.credentials, headers: opts.headers, url: u.href });
  const rule = (scenario.server || {})[u.pathname];
  if (rule && [301, 302, 303, 307, 308].includes(rule.code)) {
    if (opts.redirect === "error") throw new TypeError("Failed to fetch (redirect error)");
    if (opts.redirect === "follow") { const to = new URL(rule.location); posts.push({ host: to.hostname, path: to.pathname, body: opts.body, redirect: "followed" }); }
  }
  return { type: "opaque" };
};

const result = await new Promise((resolve, reject) => {
  try { new Function(script)(instructions, action, resolve); } catch (e) { resolve({ crashed: String(e) }); }
});
console.log(JSON.stringify({ result, posts, calls }));
