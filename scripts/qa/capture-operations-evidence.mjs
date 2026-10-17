import { createHash, verify } from 'node:crypto';
import { closeSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import path from 'node:path';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
export function verifyReceipt(receipt, role, payloadHash, binding, trust) {
  try {
    const key = trust.keys.find(k => k.id === receipt.keyId && k.role === role);
    if (!key || key.algorithm !== 'ed25519' || sha256(key.publicKeyPem) !== key.publicKeySha256) return false;
    if (receipt.payloadHash !== payloadHash || canonical(receipt.binding) !== canonical(binding)) return false;
    if (receipt.kind !== (role === 'producer' ? 'native-observation' : 'independent-review')) return false;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(receipt.signature ?? '')) return false;
    const { signature, ...body } = receipt;
    return verify(null, Buffer.from(canonical(body)), key.publicKeyPem, Buffer.from(signature, 'base64'));
  } catch { return false; }
}

/** Read-only, bounded artifact hashing. Paths must stay inside an explicit evidence root. */
export function hashArtifact(root, relative, maxBytes = 512 * 1024 * 1024) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw Error('Unsafe artifact path');
  const base = realpathSync(root), file = path.resolve(base, relative);
  const physical = realpathSync(file), rel = path.relative(base, physical);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw Error('Artifact escapes evidence root');
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > maxBytes) throw Error('Unsafe or oversized artifact');
  const fd = openSync(file, 'r'), hash = createHash('sha256'), buffer = Buffer.alloc(65536);
  let size = 0;
  try {
    for (;;) { const count = readSync(fd, buffer); if (!count) break; size += count; if (size > maxBytes) throw Error('Artifact grew beyond bound'); hash.update(buffer.subarray(0, count)); }
  } finally { closeSync(fd); }
  if (size !== stat.size) throw Error('Artifact changed while hashing');
  return { sha256: hash.digest('hex'), bytes: size };
}
