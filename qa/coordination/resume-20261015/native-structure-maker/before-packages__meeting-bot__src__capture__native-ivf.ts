/** Bounded VP8 IVF framing. PTS units are microseconds, never arrival time. */
const UINT32 = 0xffff_ffff;
function uint(value: number, max: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new Error(`invalid IVF ${label}`);
}
export function createIvfHeader(width: number, height: number, frameCount = 0): Buffer {
  uint(width, 65535, 'width'); uint(height, 65535, 'height'); uint(frameCount, UINT32, 'count');
  if (!width || !height) throw new Error('empty IVF dimensions');
  const out = Buffer.alloc(32); out.write('DKIF'); out.writeUInt16LE(32, 6); out.write('VP80', 8);
  out.writeUInt16LE(width, 12); out.writeUInt16LE(height, 14);
  out.writeUInt32LE(1_000_000, 16); out.writeUInt32LE(1, 20); out.writeUInt32LE(frameCount, 24);
  return out;
}
export function isVp8KeyFrame(bytes: Uint8Array): boolean { return bytes.length > 0 && (bytes[0]! & 1) === 0; }
export function encodeIvfFrame(bytes: Uint8Array, timestampUs: number): Buffer {
  uint(timestampUs, Number.MAX_SAFE_INTEGER, 'timestamp'); uint(bytes.byteLength, UINT32, 'length');
  if (!bytes.byteLength) throw new Error('empty VP8 chunk');
  const header = Buffer.alloc(12); header.writeUInt32LE(bytes.byteLength); header.writeBigUInt64LE(BigInt(timestampUs), 4);
  return Buffer.concat([header, bytes]);
}
export function parseIvf(input: Uint8Array, maxBytes = 512 * 1024 * 1024) {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (bytes.length < 32 || bytes.length > maxBytes || bytes.toString('ascii', 0, 4) !== 'DKIF' ||
      bytes.readUInt16LE(4) !== 0 || bytes.readUInt16LE(6) !== 32 || bytes.toString('ascii', 8, 12) !== 'VP80' ||
      bytes.readUInt32LE(16) !== 1_000_000 || bytes.readUInt32LE(20) !== 1 || bytes.readUInt32LE(28) !== 0) throw new Error('invalid IVF header');
  const width = bytes.readUInt16LE(12), height = bytes.readUInt16LE(14), count = bytes.readUInt32LE(24);
  if (!width || !height || !count) throw new Error('empty IVF');
  const frames: { timestampUs: number; bytes: Buffer; key: boolean }[] = [];
  let offset = 32, previous = -1;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length || frames.length >= count) throw new Error('IVF count/truncation');
    const size = bytes.readUInt32LE(offset), pts = bytes.readBigUInt64LE(offset + 4); offset += 12;
    if (!size || offset + size > bytes.length || pts > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('IVF length/overflow');
    const timestampUs = Number(pts), chunk = bytes.subarray(offset, offset + size), key = isVp8KeyFrame(chunk);
    if (timestampUs <= previous || (!frames.length && (timestampUs !== 0 || !key))) throw new Error('IVF order/key-first');
    if (key && (size < 10 || chunk[3] !== 0x9d || chunk[4] !== 1 || chunk[5] !== 0x2a ||
        (chunk.readUInt16LE(6) & 0x3fff) !== width || (chunk.readUInt16LE(8) & 0x3fff) !== height)) throw new Error('VP8 dimensions/codec change');
    frames.push({ timestampUs, bytes: Buffer.from(chunk), key }); previous = timestampUs; offset += size;
  }
  if (frames.length !== count) throw new Error('IVF frame count');
  return { width, height, rate: 1_000_000 as const, scale: 1 as const, frames };
}
