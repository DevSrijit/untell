// The pixel size of a JPEG or PNG from its header, without decoding it. The recorder checks every picture it
// writes or takes from the cache against the film's size: a frame of the wrong size is a wrong frame.
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  // PNG: the IHDR chunk follows the 8-byte signature; width and height are big-endian at 16 and 20.
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  // JPEG: walk the markers to the first start-of-frame (SOF0-SOF15, not DHT C4, JPG C8 or DAC CC).
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1]!;
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = (b[i + 2]! << 8) | b[i + 3]!;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { height: (b[i + 5]! << 8) | b[i + 6]!, width: (b[i + 7]! << 8) | b[i + 8]! };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** True when the picture has exactly this size. */
export const sizeIs = (b: Uint8Array, w: number, h: number) => { const s = imageSize(b); return !!s && s.width === w && s.height === h; };
