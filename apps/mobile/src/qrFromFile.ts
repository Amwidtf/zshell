import {launchImageLibrary} from 'react-native-image-picker';
import jsQR from 'jsqr';
import jpeg from 'jpeg-js';
import {base64ToBytes} from '@zshell/core-shell';
import {decodePng, RgbaImage} from './PngDecoder';

function decodeImage(bytes: Uint8Array): RgbaImage | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return decodePng(bytes);
  }
  if (bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const d = jpeg.decode(bytes, {useTArray: true});
    return {
      width: d.width,
      height: d.height,
      rgba: new Uint8ClampedArray(d.data),
    };
  }
  return null;
}

/** Decode a QR (pairing URL) from base64 image bytes; null when no QR found. */
export function decodeQrFromBase64(b64: string): string | null {
  const img = decodeImage(base64ToBytes(b64));
  if (img == null) {
    return null;
  }
  const code = jsQR(img.rgba, img.width, img.height);
  return code != null ? code.data : null;
}

/** Open the system photo picker and try to decode a QR from the chosen image. */
export async function pickAndDecodeQr(): Promise<string | null> {
  const res = await launchImageLibrary({
    mediaType: 'photo',
    includeBase64: true,
    selectionLimit: 1,
  });
  const asset = res.assets?.[0];
  if (asset?.base64 == null) {
    return null;
  }
  return decodeQrFromBase64(asset.base64);
}
