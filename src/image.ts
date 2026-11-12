import sharp from "sharp";
import { BYTES_PER_PIXEL } from "./protocol.js";
import type { ImageSource, ResizeFit } from "./types.js";

/** RGB888 to RGB565, serialized little-endian as the panel expects. */
export function rgb888ToRgb565(rgb: Buffer): Buffer {
  if (rgb.length % 3 !== 0) {
    throw new Error(`RGB buffer length must be divisible by 3 (received ${rgb.length})`);
  }

  const output = Buffer.allocUnsafe((rgb.length / 3) * BYTES_PER_PIXEL);
  for (let source = 0, target = 0; source < rgb.length; source += 3, target += 2) {
    const r = rgb[source]!;
    const g = rgb[source + 1]!;
    const b = rgb[source + 2]!;
    const value = ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
    output[target] = value & 0xff;
    output[target + 1] = value >> 8;
  }
  return output;
}

/**
 * Decodes any image sharp understands and returns a framebuffer of exactly
 * width * height pixels in RGB565 little-endian.
 *
 * `fit` is "cover" by default so the image fills the panel; "contain" keeps the
 * whole image and pads with `background`.
 */
export async function loadFramebuffer(
  source: ImageSource,
  width: number,
  height: number,
  { fit = "cover", background = "#000000" }: { fit?: ResizeFit; background?: string } = {},
): Promise<Buffer> {
  const { data, info } = await sharp(source)
    .flatten({ background })
    .resize(width, height, { fit, background })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const expected = width * height * 3;
  if (info.width !== width || info.height !== height || info.channels !== 3 || data.length !== expected) {
    throw new Error(
      `Unexpected decoded image: ${info.width}x${info.height}, ${info.channels} channels, ${data.length} bytes`,
    );
  }
  return rgb888ToRgb565(data);
}

/** Builds a framebuffer filled with a single colour, for clears and test patterns. */
export function solidFramebuffer(width: number, height: number, r: number, g: number, b: number): Buffer {
  const value = ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
  const output = Buffer.allocUnsafe(width * height * BYTES_PER_PIXEL);
  for (let offset = 0; offset < output.length; offset += 2) {
    output[offset] = value & 0xff;
    output[offset + 1] = value >> 8;
  }
  return output;
}
