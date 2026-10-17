/** Hash large local model/dependency/checkpoint files without loading their contents into memory. */
import { openSync, readSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { assertPrivateTrainingPath } from './private-path.mjs';
export function hashTrainingFile(path) {
  assertPrivateTrainingPath(path);
  const hash=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024),descriptor=openSync(path,'r');
  try {let bytes;while((bytes=readSync(descriptor,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,bytes));return hash.digest('hex');}
  finally {closeSync(descriptor);}
}
