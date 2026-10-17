/** Explicit provisioning of a NEW directory; never repairs an existing host ACL. */
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPrivateDirectory } from "./private-acl.js";

export function createPrivateDirectory(directory: string): string {
  if (!path.isAbsolute(directory) || /^[/\\]{2}/.test(directory) || /[\x00-\x1f]/.test(directory)) {
    throw new Error("New local private directory required");
  }
  const target = path.resolve(directory);
  for (let parent = path.dirname(target); ; parent = path.dirname(parent)) {
    const st = lstatSync(parent);
    if (!st.isDirectory() || st.isSymbolicLink() || realpathSync(parent).toLowerCase() !== parent.toLowerCase()) {
      throw new Error("Private directory parent redirected");
    }
    if (path.dirname(parent) === parent) break;
  }
  if (process.platform === "win32") {
    const executable = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "psmodulepath")),
      PSModulePath: path.join(path.dirname(executable), "Modules") };
    const result = spawnSync(executable, ["-NoProfile", "-NonInteractive", "-File",
      fileURLToPath(new URL("private-directory.ps1", import.meta.url)), "-TargetPath", target],
    { env, encoding: "utf8", timeout: 10000, maxBuffer: 65536, windowsHide: true, shell: false });
    if (result.error || result.status !== 0) throw new Error("New private Windows directory creation refused");
  } else {
    mkdirSync(target, { mode: 0o700 });
  }
  verifyPrivateDirectory(target);
  return target;
}
