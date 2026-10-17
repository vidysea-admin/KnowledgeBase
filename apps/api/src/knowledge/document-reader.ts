import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, isAbsolute } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { accessSync, constants, statSync } from "node:fs";

/** True DOCX pagination requires rendering. No renderer means unavailable, never guessed pages. */
export function createDocxRenderer(binary: string | undefined): ((bytes: Uint8Array) => Promise<Uint8Array>) | undefined {
  if (!binary) return undefined;
  if (!isAbsolute(binary)) return undefined;
  try { accessSync(binary, constants.X_OK); if (!statSync(binary).isFile()) return undefined; } catch { return undefined; }
  const execute = promisify(execFile);
  return async bytes => {
    const parent = resolve(tmpdir()); const dir = await mkdtemp(join(parent, "lkb-docx-pages-"));
    try {
      const input = join(dir, "document.docx"); await writeFile(input, bytes);
      const profile = pathToFileURL(join(dir, "profile")).href;
      await execute(binary, [`-env:UserInstallation=${profile}`, "--headless", "--convert-to", "pdf:writer_pdf_Export", "--outdir", dir, input],
        { timeout: 30_000, maxBuffer: 64_000, windowsHide: true });
      const output = join(dir, "document.pdf");
      if ((await stat(output)).size > 512_000) throw new Error("Rendered PDF exceeds document byte limit");
      return new Uint8Array(await readFile(output));
    } finally {
      if (dirname(resolve(dir)) !== parent || !resolve(dir).startsWith(join(parent, "lkb-docx-pages-"))) throw new Error("Unsafe document cleanup path");
      await rm(dir, { recursive: true, force: true });
    }
  };
}
