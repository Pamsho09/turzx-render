import type { Orientation } from "./protocol.js";

/** Anything sharp accepts as input: a path, or encoded/raw image bytes. */
export type ImageSource = string | Buffer | Uint8Array;

export type ResizeFit = "cover" | "contain" | "fill" | "inside" | "outside";

export interface DisplayDeviceInfo {
  manufacturer?: string;
  product?: string;
  serialNumber?: string;
  vendorId: number;
  productId: number;
}

export interface DisplayOptions {
  /** Orientation applied on open. Defaults to landscape. */
  orientation?: Orientation;
  /** Brightness percentage applied on open, 0-100. Left untouched when omitted. */
  brightness?: number;
  /** Per-transfer USB timeout in milliseconds. */
  timeoutMs?: number;
}

export interface DrawRegionOptions {
  /**
   * Blank the panel while the pixels are transferred so the new content appears
   * at once instead of wiping top to bottom. Costs ~40ms. Meant for full-screen
   * repaints: on a small region it flashes the whole display.
   */
  atomic?: boolean;
}

export interface DrawImageOptions extends DrawRegionOptions {
  fit?: ResizeFit;
  background?: string;
}

export interface CliOptions {
  image?: string;
  orientation: Orientation;
  brightness?: number;
  clear: boolean;
  list: boolean;
  fit: ResizeFit;
}
