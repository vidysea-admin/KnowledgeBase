// @vitest-environment node
// Renders apps/web/nginx.conf the way the official nginx entrypoint does (envsubst over the defined
// environment) after sourcing 18-lkb-base-path.envsh, then runs 40-lkb-runtime-config.sh against a copy
// of the built index.html. Needs a POSIX `sh` (CI/Linux, or Git Bash on Windows).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DOCKER_DIR = __dirname;
const WEB_DIR = join(DOCKER_DIR, "..");
const sh = spawnSync("sh", ["-c", "echo ok"], { encoding: "utf8" });
const HAVE_SH = sh.status === 0;

function posix(p: string): string { return p.split(String.fromCharCode(92)).join("/"); }

interface Rendered { nginx: string; configJs: string; indexHtml: string; env: Record<string, string>; status: number; stderr: string }

function run(envOverrides: Record<string, string>): Rendered {
  const tmp = mkdtempSync(join(tmpdir(), "lkb-web-"));
  const html = join(tmp, "html");
  cpSync(join(WEB_DIR, "public"), html, { recursive: true });
  writeFileSync(join(html, "index.html"), readFileSync(join(WEB_DIR, "index.html"), "utf8"));
  const site = join(tmp, "site");
  const script = [
    `. '${posix(join(DOCKER_DIR, "18-lkb-base-path.envsh"))}' || exit 41`,
    `'${posix(join(DOCKER_DIR, "40-lkb-runtime-config.sh"))}' && '${posix(join(DOCKER_DIR, "40-lkb-runtime-config.sh"))}' || exit 42`,
    `env`,
  ].join("\n");
  const r = spawnSync("sh", ["-c", script], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", LKB_HTML_DIR: posix(html), LKB_SITE_DIR: posix(site), PORT: "80", ...envOverrides },
  });
  const env: Record<string, string> = {};
  for (const line of (r.stdout ?? "").split("\n")) { const i = line.indexOf("="); if (i > 0) env[line.slice(0, i)] = line.slice(i + 1); }
  // envsubst equivalent: replace ${NAME} for names defined in the environment, leave everything else.
  const template = readFileSync(join(WEB_DIR, "nginx.conf"), "utf8");
  const nginx = template.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, name: string) => (name in env ? env[name]! : m));
  const read = (f: string) => (existsSync(join(html, f)) ? readFileSync(join(html, f), "utf8") : "");
  return { nginx, configJs: read("config.js"), indexHtml: read("index.html"), env, status: r.status ?? -1, stderr: r.stderr ?? "" };
}

describe.skipIf(!HAVE_SH)("web container runtime config (APP_BASE_PATH)", () => {
  it("default (unset) serves at root with /api proxied and an SPA fallback", () => {
    const r = run({});
    expect(r.status).toBe(0);
    expect(r.configJs).toContain('basePath: ""');
    expect(r.configJs).toContain('apiBase: ""');
    expect(r.indexHtml).toContain('<base href="/"');
    expect(r.nginx).toContain("listen 80;");
    expect(r.nginx).toContain("location ^~ /api/ {");
    expect(r.nginx).toContain("proxy_pass http://api:3300/;");
    expect(r.nginx).toContain("location / {");
    expect(r.nginx).toContain("try_files $uri $uri/ /index.html;");
    expect(r.nginx).not.toMatch(/\$\{/);
    expect(r.env.LKB_DOC_ROOT).toBe(r.env.LKB_HTML_DIR);
  });

  it.each(["/knowledgebase", "/knowledgebase/", "knowledgebase", "//knowledgebase//"])("APP_BASE_PATH=%j serves under /knowledgebase, with and without a trailing slash", (raw) => {
    const r = run({ APP_BASE_PATH: raw });
    expect(r.status).toBe(0);
    expect(r.configJs).toContain('basePath: "/knowledgebase"');
    expect(r.indexHtml).toContain('<base href="/knowledgebase/"');
    expect(r.nginx).toContain("location ^~ /knowledgebase/api/ {");
    expect(r.nginx).toContain("proxy_pass http://api:3300/;"); // URI part "/" strips the /knowledgebase/api/ prefix
    expect(r.nginx).toContain("location ~ ^/knowledgebase$ {"); // no trailing slash
    expect(r.nginx).toContain("try_files /knowledgebase/index.html =404;");
    expect(r.nginx).toContain("location /knowledgebase/ {"); // trailing slash + deep links
    expect(r.nginx).toContain("try_files $uri $uri/ /knowledgebase/index.html;");
    expect(r.nginx).toContain(`root ${r.env.LKB_SITE_DIR};`);
    expect(r.nginx).not.toMatch(/\$\{/);
    // the bundle is reachable at <root>/knowledgebase/ (symlink, or a copy where symlinks are unavailable)
    expect(existsSync(join(r.env.LKB_SITE_DIR!, "knowledgebase", "index.html"))).toBe(true);
    expect(existsSync(join(r.env.LKB_SITE_DIR!, "knowledgebase", "config.js"))).toBe(true);
  });

  it("supports a nested base path and an explicit API base and upstream", () => {
    const r = run({ APP_BASE_PATH: "/a/b", APP_API_BASE: "https://api.example.com/", API_UPSTREAM: "http://10.0.0.5:3300/" });
    expect(r.status).toBe(0);
    expect(r.configJs).toContain('basePath: "/a/b"');
    expect(r.configJs).toContain('apiBase: "https://api.example.com"');
    expect(r.nginx).toContain("location ^~ /a/b/api/ {");
    expect(r.nginx).toContain("proxy_pass http://10.0.0.5:3300/;");
  });

  // ISS-UAWEB-004: the account sign-in flag. Dark unless APP_USER_ACCOUNTS is exactly 1 or true (any case).
  it("config.js carries userAccounts: false when APP_USER_ACCOUNTS is absent", () => {
    const r = run({});
    expect(r.status).toBe(0);
    expect(r.configJs).toContain("userAccounts: false");
    expect(r.configJs).not.toContain("userAccounts: true");
  });

  it.each(["true", "TRUE", "True", "1"])("config.js carries userAccounts: true for APP_USER_ACCOUNTS=%j", (raw) => {
    const r = run({ APP_USER_ACCOUNTS: raw });
    expect(r.status).toBe(0);
    expect(r.configJs).toContain("userAccounts: true");
    expect(r.configJs).toContain('basePath: ""'); // the other keys are untouched
  });

  it.each(["false", "0", "", "yes", "on", "true;alert(1)", " "])("config.js stays userAccounts: false for APP_USER_ACCOUNTS=%j", (raw) => {
    const r = run({ APP_USER_ACCOUNTS: raw });
    expect(r.status).toBe(0);
    expect(r.configJs).toContain("userAccounts: false");
    expect(r.configJs).not.toContain("alert");
  });

  it("the flag survives a base path and parses as a script (window.__LKB_CONFIG__ is an object literal)", () => {
    const r = run({ APP_BASE_PATH: "/knowledgebase", APP_USER_ACCOUNTS: "true" });
    const win: { __LKB_CONFIG__?: { basePath: string; apiBase: string; userAccounts: unknown } } = {};
    new Function("window", r.configJs)(win);
    expect(win.__LKB_CONFIG__).toEqual({ basePath: "/knowledgebase", apiBase: "", userAccounts: true });
  });

  it("re-running on an already patched index.html is idempotent (container restart)", () => {
    const r = run({ APP_BASE_PATH: "/knowledgebase" });
    expect(r.indexHtml.match(/<base href=/g)?.length).toBe(1);
  });

  it.each(["/a/../b", "/a b", "/a;b", '/a"b', "/a$(id)", "/a/./b"])("refuses unsafe APP_BASE_PATH %j", (raw) => {
    const r = run({ APP_BASE_PATH: raw });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/APP_BASE_PATH/);
  });

  it("refuses an unsafe APP_API_BASE and API_UPSTREAM", () => {
    expect(run({ APP_API_BASE: 'x";alert(1);"' }).status).not.toBe(0);
    expect(run({ APP_API_BASE: "javascript:alert(1)" }).status).not.toBe(0);
    expect(run({ API_UPSTREAM: "api:3300" }).status).not.toBe(0);
    expect(run({ API_UPSTREAM: "http://api:3300;rm" }).status).not.toBe(0);
  });
});
