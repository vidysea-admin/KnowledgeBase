/**
 * packages/core/src/keyframes/perceptual-hash.ts — T-041 slice 3 (UNWIRED, PURE). 64-bit difference hash
 * (dHash) of ONE frame that ffmpeg already downscaled to 9x8 8-bit grayscale (`scale=9:8:flags=area,
 * format=gray`, rawvideo). No image library: ffmpeg does the decoding and resizing; this reads 72 bytes.
 *
 * Bit (row r, col c) = 1 when pixel(r,c) > pixel(r,c+1), 8 bits per row, row-major, MSB first -> 16 hex chars,
 * the shape `dedupeKeyframes` expects (equal-length hex, Hamming distance). A flat frame hashes to all zeros;
 * a uniform brightness change keeps every comparison and so keeps the hash. Not validated on real recordings.
 */
export const HASH_WIDTH = 9;
export const HASH_HEIGHT = 8;
/** Bytes of one raw gray frame at the hash size. */
export const HASH_FRAME_BYTES = HASH_WIDTH * HASH_HEIGHT;

/** dHash of one 9x8 gray frame. Throws RangeError unless the frame is exactly 72 bytes. */
export function dHashGray9x8(frame: Uint8Array): string {
  if (!(frame instanceof Uint8Array) || frame.length !== HASH_FRAME_BYTES) {
    throw new RangeError(`dHashGray9x8 needs exactly ${HASH_FRAME_BYTES} bytes`);
  }
  let hex = "";
  for (let r = 0; r < HASH_HEIGHT; r++) {
    let byte = 0;
    for (let c = 0; c < HASH_WIDTH - 1; c++) {
      byte = (byte << 1) | (frame[r * HASH_WIDTH + c]! > frame[r * HASH_WIDTH + c + 1]! ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Splits a raw gray stream into 72-byte frames and hashes each. Throws RangeError on a trailing partial frame. */
export function dHashRawStream(raw: Uint8Array): string[] {
  if (raw.length % HASH_FRAME_BYTES !== 0) throw new RangeError("raw stream is not a whole number of frames");
  const out: string[] = [];
  for (let o = 0; o < raw.length; o += HASH_FRAME_BYTES) out.push(dHashGray9x8(raw.subarray(o, o + HASH_FRAME_BYTES)));
  return out;
}
