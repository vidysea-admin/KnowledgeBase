import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";

/** Explicit selectors reuse a physical Chrome subprofile; omission keeps legacy Default. */
export function browserProfileArgs(parent: string, selected?: string): string[] {
  if (selected === undefined) return [];
  if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,99}$/.test(selected) || selected.includes("..") ||
      selected.trim() !== selected || /[. ]$/.test(selected)) throw new Error("invalid browser profile-directory");
  const canonical = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  const root = path.resolve(parent), directory = path.join(root, selected), preferences = path.join(directory, "Preferences");
  try {
    for (const target of [root, directory, preferences]) {
      const stat = lstatSync(target);
      if (stat.isSymbolicLink() || canonical(realpathSync(target)) !== canonical(target)) throw new Error("redirected profile");
      if (target === preferences ? !stat.isFile() : !stat.isDirectory()) throw new Error("invalid profile entry");
    }
  } catch { throw new Error("browser profile-directory must be an existing physical subprofile with Preferences"); }
  return ["--profile-directory", selected];
}

export function selectedBrowserProfile(rest: string[], parent: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const indices = rest.flatMap((arg, index) => arg === "--profile-directory" ? [index] : []);
  if (indices.length > 1) throw new Error("duplicate --profile-directory");
  const index = indices[0];
  const selected = index === undefined ? env.LKB_BROWSER_PROFILE_DIRECTORY : rest[index + 1];
  if (index !== undefined && (selected === undefined || selected.startsWith("--"))) throw new Error("--profile-directory requires a value");
  browserProfileArgs(parent, selected);
  return selected;
}
