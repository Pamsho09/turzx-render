/**
 * Library entry point for the TURZX / Turing / UsbMonitor 3.5" display.
 *
 * ```ts
 * import { TurzxDisplay, Orientation } from "turzx-render";
 *
 * const display = await TurzxDisplay.open({ orientation: Orientation.Landscape });
 * await display.drawImage("./photo.png");
 * await display.close();
 * ```
 */
export { TurzxDisplay } from "./display.js";
export { findDisplay } from "./usb.js";
export {
  COMMAND,
  NATIVE_HEIGHT,
  NATIVE_WIDTH,
  Orientation,
  brightnessPacket,
  bitmapHeader,
  displaySize,
  encodeCommand,
  framebufferBytes,
  isLandscape,
  orientationPacket,
} from "./protocol.js";
export { loadFramebuffer, rgb888ToRgb565, solidFramebuffer } from "./image.js";
export type {
  DisplayDeviceInfo,
  DisplayOptions,
  DrawImageOptions,
  DrawRegionOptions,
  ImageSource,
  ResizeFit,
} from "./types.js";
