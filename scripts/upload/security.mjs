/** Local upload boundaries: configured roots, pinned reads, shared-schema validation. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, realpath, open, mkdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep, join, parse } from 'node:path';
import { readFileSync } from 'node:fs';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const tenantSegment = tenant => hash(tenant);
export function identity(env) {
  const tenantId = env.UPLOAD_TENANT_ID?.trim(), actor = env.UPLOAD_ACTOR?.trim();
  if (!tenantId || tenantId.length > 200 || !actor || actor.length > 200) throw new Error('trusted UPLOAD_TENANT_ID and UPLOAD_ACTOR configuration required');
  return { tenantId, actor };
}
export async function confined(root, candidate, { directory = false } = {}) {
  const base = resolve(root), target = resolve(candidate), rel = relative(base, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('path outside configured root');
  const anchor = parse(base).root, baseParts = base.slice(anchor.length).split(sep).filter(Boolean);
  const parts = [anchor, ...baseParts.map((_p, i) => join(anchor, ...baseParts.slice(0, i + 1))),
    ...rel.split(sep).filter(Boolean).map((_p, i, arr) => join(base, ...arr.slice(0, i + 1)))];
  for (const part of parts) if ((await lstat(part)).isSymbolicLink()) throw new Error('linked path refused');
  const actual = await realpath(target), actualRoot = await realpath(base), actualRel = relative(actualRoot, actual);
  if (actualRel === '..' || actualRel.startsWith(`..${sep}`) || isAbsolute(actualRel)) throw new Error('resolved path outside root');
  const info = await lstat(actual);
  if (directory ? !info.isDirectory() : (!info.isFile() || info.nlink !== 1)) throw new Error('unsafe path type');
  return actual;
}
export async function pinnedBytes(root, path, maxBytes = 1024 * 1024 * 1024) {
  const safe = await confined(root, path), before = await lstat(safe);
  const fd = await open(safe, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const held = await fd.stat();
    if (held.ino !== before.ino || held.dev !== before.dev || !held.isFile() || held.nlink !== 1 || held.size > maxBytes) throw new Error('input changed or exceeds byte limit');
    await confined(root, path);
    const bytes = await fd.readFile();
    const after = await fd.stat();
    if (after.size !== held.size || after.mtimeMs !== held.mtimeMs || bytes.length !== held.size) throw new Error('input changed during read');
    return bytes;
  } finally { await fd.close(); }
}
export async function ownedDirectory(root, ...segments) {
  await confined(root, root, { directory: true });
  let next = resolve(root);
  for (const segment of segments) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,160}$/.test(segment) || segment === '..') throw new Error('invalid owned path segment');
    next = join(next, segment); await mkdir(next).catch(e => { if (e.code !== 'EEXIST') throw e; });
    await confined(root, next, { directory: true });
  }
  return next;
}
const schemas = new Map();
/** Jobs currently uses these schema keywords only; fail closed if its definition grows. */
export function validateJob(doc) {
  let schema = schemas.get('jobs');
  if (!schema) { schema = JSON.parse(readFileSync(new URL('../../schema/jobs.schema.json', import.meta.url), 'utf8')); schemas.set('jobs', schema); }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || schema.required.some(k => !(k in doc))) throw new Error('invalid jobs schema');
  for (const [key, rule] of Object.entries(schema.properties)) {
    if (!(key in doc)) continue;
    if (Object.keys(rule).some(k => !['type', 'enum', 'minimum', 'minLength', 'format', 'description'].includes(k))) throw new Error('jobs schema validator update required');
    const value = doc[key];
    if (typeof value !== rule.type || (rule.type === 'number' && !Number.isFinite(value)) ||
        (rule.enum && !rule.enum.includes(value)) || (rule.minimum !== undefined && value < rule.minimum) ||
        (rule.minLength !== undefined && value.length < rule.minLength) ||
        (rule.format === 'date-time' && !Number.isFinite(Date.parse(value)))) throw new Error('invalid jobs schema');
  }
  return doc;
}
