import {inflate} from 'pako';

/**
 * Minimal dependency-free PNG decoder for QR screenshots: 8-bit depth,
 * color types 0/2/3/4/6, non-interlaced. Uses pako (pure JS) for IDAT
 * inflate so it runs identically on Hermes and any future ArkTS host.
 */

export interface RgbaImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  if (pb <= pc) {
    return b;
  }
  return c;
}

const CHANNELS: Record<number, number> = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4};

export function decodePng(bytes: Uint8Array): RgbaImage | null {
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIG[i]) {
      return null;
    }
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: number[] = [];

  while (pos + 8 <= bytes.length) {
    const len =
      ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
    const type = String.fromCharCode(
      bytes[pos + 4],
      bytes[pos + 5],
      bytes[pos + 6],
      bytes[pos + 7],
    );
    const data = bytes.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width =
        ((data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]) >>> 0;
      height =
        ((data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7]) >>> 0;
      const bitDepth = data[8];
      colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8 || interlace !== 0 || CHANNELS[colorType] == null) {
        return null;
      }
    } else if (type === 'PLTE') {
      palette = data.slice();
    } else if (type === 'tRNS') {
      trns = data.slice();
    } else if (type === 'IDAT') {
      for (let i = 0; i < data.length; i++) {
        idat.push(data[i]);
      }
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (width <= 0 || height <= 0 || colorType < 0 || idat.length === 0) {
    return null;
  }
  if (colorType === 3 && palette == null) {
    return null;
  }

  const channels = CHANNELS[colorType];
  const bpp = channels;
  let raw: Uint8Array;
  try {
    raw = inflate(new Uint8Array(idat));
  } catch {
    return null;
  }
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) {
    return null;
  }

  // Unfilter scanlines into recon (row-major pixels, channels each).
  const recon = new Uint8Array(height * stride);
  let src = 0;
  let prev = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const rowStart = y * stride;
    const prevRowStart = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const filt = raw[src + x];
      const left = x >= bpp ? recon[rowStart + x - bpp] : 0;
      const up = y > 0 ? recon[prevRowStart + x] : 0;
      const upLeft = y > 0 && x >= bpp ? recon[prevRowStart + x - bpp] : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = filt;
          break;
        case 1:
          value = filt + left;
          break;
        case 2:
          value = filt + up;
          break;
        case 3:
          value = filt + ((left + up) >> 1);
          break;
        case 4:
          value = filt + paeth(left, up, upLeft);
          break;
        default:
          return null;
      }
      recon[rowStart + x] = value & 0xff;
    }
    src += stride;
    prev = rowStart;
  }
  void prev;

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const o = p * channels;
    const q = p * 4;
    switch (colorType) {
      case 0:
        rgba[q] = recon[o];
        rgba[q + 1] = recon[o];
        rgba[q + 2] = recon[o];
        rgba[q + 3] = 255;
        break;
      case 2:
        rgba[q] = recon[o];
        rgba[q + 1] = recon[o + 1];
        rgba[q + 2] = recon[o + 2];
        rgba[q + 3] = 255;
        break;
      case 3: {
        const idx = recon[o];
        rgba[q] = palette![idx * 3];
        rgba[q + 1] = palette![idx * 3 + 1];
        rgba[q + 2] = palette![idx * 3 + 2];
        rgba[q + 3] = trns != null && idx < trns.length ? trns[idx] : 255;
        break;
      }
      case 4:
        rgba[q] = recon[o];
        rgba[q + 1] = recon[o];
        rgba[q + 2] = recon[o];
        rgba[q + 3] = recon[o + 1];
        break;
      case 6:
        rgba[q] = recon[o];
        rgba[q + 1] = recon[o + 1];
        rgba[q + 2] = recon[o + 2];
        rgba[q + 3] = recon[o + 3];
        break;
    }
  }
  return {width, height, rgba};
}
