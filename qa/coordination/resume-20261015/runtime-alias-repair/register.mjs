// QA-only synchronous adapter. Import the unchanged safe TS loader first.
import '../../../../.cache/coordination/safe-test-runtime/register.mjs';
import { registerHooks, createRequire } from 'node:module';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspace = realpathSync(fileURLToPath(new URL('../../../../', import.meta.url)));
const core = realpathSync(resolve(workspace, 'packages/core'));
const source = realpathSync(resolve(core, 'src'));
const contained = (root, candidate) => {
  const tail = relative(root, candidate);
  return tail !== '..' && !tail.startsWith(`..${sep}`) && !tail.startsWith(sep) && !/^[A-Za-z]:/u.test(tail);
};

export function resolveWorkspaceAlias(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (original) {
    // No fallback for export-map denial, valid native results, foreign packages,
    // encoded separators, traversal, extensionless imports or arbitrary paths.
    if (original.code !== 'ERR_MODULE_NOT_FOUND'
      || !/^@lkb\/core\/src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.js$/u.test(specifier)
      || !context.parentURL?.startsWith('file:')) throw original;
    try {
      const importer = realpathSync(fileURLToPath(context.parentURL));
      if (!contained(workspace, importer)) throw original;
      const packageJson = realpathSync(createRequire(context.parentURL).resolve('@lkb/core/package.json'));
      if (packageJson !== realpathSync(resolve(core, 'package.json'))) throw original;
      const metadata = JSON.parse(readFileSync(packageJson, 'utf8'));
      // An export map is authoritative; do not manufacture a new subpath export.
      if (metadata.name !== '@lkb/core' || Object.hasOwn(metadata, 'exports')) throw original;
      const candidate = realpathSync(resolve(core, specifier.slice('@lkb/core/'.length).replace(/\.js$/u, '.ts')));
      if (!contained(workspace, core) || !contained(core, source)
        || !contained(workspace, candidate) || !contained(source, candidate)
        || !statSync(candidate).isFile()) throw original;
      return nextResolve(pathToFileURL(candidate).href, context);
    } catch { throw original; }
  }
}

registerHooks({ resolve: resolveWorkspaceAlias });
