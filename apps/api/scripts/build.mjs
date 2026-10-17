// apps/api/scripts/build.mjs -- production bundle: src/index.ts -> dist/server.js (plain `node`, no tsx).
//
// Why esbuild bundling (not `tsc`): every @lkb/* workspace package has `"main": "./src/index.ts"`,
// so a tsc build of apps/api alone would still import .ts at runtime. Bundling inlines the
// workspace sources; real npm packages stay EXTERNAL and come from node_modules in the image.
//
// Runtime file lookups: several modules locate repo files with `new URL("../../../x", import.meta.url)`
// relative to THEIR source location. After bundling, import.meta.url is the bundle's location, so
// each such module's import.meta.url is rewritten to a URL computed as if the file still sat at its
// source path inside the repo tree (<root>/<rel path>). The bundle must therefore live at
// <root>/apps/api/dist/server.js, with <root>/schema and <root>/config present beside it.
// apps/api/src/index.ts is left untouched: its "run only when executed directly" guard compares
// import.meta.url to argv[1] and needs the real bundle URL.
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from 'node:crypto';
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(here, "..");
const root = path.resolve(apiDir, "../..");

async function loadEsbuild() {
  try { return await import("esbuild"); } catch (e) {
    // Dev fallback only (a checkout whose apps/api/node_modules predates the esbuild devDependency).
    const pnpm = path.join(root, "node_modules", ".pnpm");
    const dir = process.env.LKB_ESBUILD_DIR ?? readdirSync(pnpm).filter((d) => d.startsWith("esbuild@")).sort().pop();
    if (!dir) throw e;
    const base = process.env.LKB_ESBUILD_DIR ?? path.join(pnpm, dir, "node_modules", "esbuild");
    return createRequire(path.join(base, "x.js"))(base);
  }
}
const esbuild = await loadEsbuild();

const HELPER = `const __lkbBundleUrl = import.meta.url; const __lkbSrcUrl = (r) => new URL(r, new URL("../../../", import.meta.url)).href;\n`;
const runtimeAssets = new Map();
const keepRealUrls = new Set([path.join(apiDir, 'src', 'index.ts'), path.join(apiDir, 'src', 'source-intake', 'jobs', 'entry.ts')]);

const plugin = {
  name: "lkb-build",
  setup(build) {
    // Real npm deps stay external; @lkb/* workspace sources, relative and absolute paths are bundled.
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      if (path.isAbsolute(args.path) || args.path.startsWith("@lkb/")) return undefined;
      return { path: args.path, external: true };
    });
    build.onLoad({ filter: /\.ts$/ }, (args) => {
      if (args.path.includes(`${path.sep}node_modules${path.sep}`) || keepRealUrls.has(path.resolve(args.path))) return undefined;
      const src = readFileSync(args.path, 'utf8').replace(/new URL\((['"])([^'"\r\n]+\.ps1)\1,\s*import\.meta\.url\)/g, (_match, _quote, name) => {
        const asset = path.resolve(path.dirname(args.path), name), relAsset = path.relative(root, asset);
        if (relAsset.startsWith('..') || path.isAbsolute(relAsset)) throw new Error('Runtime asset outside workspace');
        const filename = createHash('sha256').update(relAsset.split(path.sep).join('/')).digest('hex').slice(0, 12) + '-' + path.basename(asset);
        runtimeAssets.set(filename, readFileSync(asset));
        return `new URL(${JSON.stringify('./runtime-assets/' + filename)}, __lkbBundleUrl)`;
      });
      if (!src.includes("import.meta.url") && !src.includes("__lkbBundleUrl")) return undefined;
      const rel = path.relative(root, args.path).split(path.sep).join("/");
      if (rel.startsWith("..")) return undefined;
      return { contents: HELPER + src.replaceAll("import.meta.url", `__lkbSrcUrl(${JSON.stringify(rel)})`), loader: "ts", resolveDir: path.dirname(args.path) };
    });
  },
};

const outfile = path.join(apiDir, "dist", "server.js");
const result = await esbuild.build({
  entryPoints: { server: path.join(apiDir, 'src', 'index.ts'), 'source-worker': path.join(apiDir, 'src', 'source-intake', 'jobs', 'entry.ts') },
  outdir: path.join(apiDir, 'dist'), bundle: true, platform: "node", format: "esm", target: "node24",
  sourcemap: "linked", metafile: true, logLevel: "warning", legalComments: "none",
  banner: { js: 'import { createRequire as __lkbCreateRequire } from "node:module"; const require = __lkbCreateRequire(import.meta.url);' },
  plugins: [plugin],
});
const externals = new Set();
mkdirSync(path.join(apiDir, 'dist', 'runtime-assets'), { recursive: true });
for (const [filename, bytes] of runtimeAssets) writeFileSync(path.join(apiDir, 'dist', 'runtime-assets', filename), bytes);
for (const o of Object.values(result.metafile.outputs)) for (const i of o.imports) if (i.external && !i.path.startsWith("node:")) externals.add(i.path);
writeFileSync(path.join(apiDir, 'dist', 'runtime-externals.json'), JSON.stringify([...externals].sort(), null, 2) + '\n');
console.log(`built ${path.relative(root, outfile)} (${statSync(outfile).size} bytes)`);
console.log(`external packages: ${[...externals].sort().join(", ")}`);
