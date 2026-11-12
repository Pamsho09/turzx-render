/**
 * Wire protocol for the TURZX / Turing / UsbMonitor 3.5" display (Revision A).
 *
 * The command encoding is the one documented by turing-smart-screen-python
 * (library/lcd/lcd_comm_rev_a.py). The transport is NOT: this device is driven
 * through its USB bulk endpoint instead of the CDC serial port. See src/usb.ts.
 */

/** Panel geometry in its native portrait orientation. */
export const NATIVE_WIDTH = 320;
export const NATIVE_HEIGHT = 480;
export const BYTES_PER_PIXEL = 2;

/** USB identity of the display, and the bulk endpoint that accepts commands. */
export const USB_VENDOR_ID = 0x1a86;
export const USB_PRODUCT_ID = 0x5722;
export const USB_SERIAL_NUMBER = "USB35INCHIPSV2";
/** CDC data interface; the control interface (0) is not used. */
export const USB_INTERFACE = 1;
export const USB_BULK_OUT_ENDPOINT = 3;

export const COMMAND = {
  RESET: 101,
  CLEAR: 102,
  /** Reported by the reference implementation but never verified on this unit. */
  TO_BLACK: 103,
  SCREEN_OFF: 108,
  SCREEN_ON: 109,
  SET_BRIGHTNESS: 110,
  SET_ORIENTATION: 121,
  DISPLAY_BITMAP: 197,
} as const;

export enum Orientation {
  Portrait = 0,
  // Revision A wire values are not clockwise/sequential.
  ReversePortrait = 1,
  Landscape = 2,
  ReverseLandscape = 3,
}

export function isLandscape(orientation: Orientation): boolean {
  return orientation === Orientation.Landscape || orientation === Orientation.ReverseLandscape;
}

/** Visible size for an orientation: the panel is 320x480 and rotates logically. */
export function displaySize(orientation: Orientation): { width: number; height: number } {
  return isLandscape(orientation)
    ? { width: NATIVE_HEIGHT, height: NATIVE_WIDTH }
    : { width: NATIVE_WIDTH, height: NATIVE_HEIGHT };
}

export function framebufferBytes(orientation: Orientation): number {
  const { width, height } = displaySize(orientation);
  return width * height * BYTES_PER_PIXEL;
}

/**
 * Revision A's six-byte command format packs four 10-bit coordinates into
 * five bytes. ex/ey are inclusive, not width/height. Byte 5 is the command.
 */
export function encodeCommand(command: number, x = 0, y = 0, ex = 0, ey = 0): Buffer {
  for (const [name, value] of Object.entries({ x, y, ex, ey })) {
    if (!Number.isInteger(value) || value < 0 || value > 0x3ff) {
      throw new RangeError(`${name} must be an integer between 0 and 1023`);
    }
  }

  return Buffer.from([
    x >> 2,
    ((x & 0x03) << 6) | (y >> 4),
    ((y & 0x0f) << 4) | (ex >> 6),
    ((ex & 0x3f) << 2) | (ey >> 8),
    ey & 0xff,
    command & 0xff,
  ]);
}

export function bitmapHeader(x: number, y: number, width: number, height: number): Buffer {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError("width and height must be positive integers");
  }
  return encodeCommand(COMMAND.DISPLAY_BITMAP, x, y, x + width - 1, y + height - 1);
}

/** Orientation packet is 16 bytes: the command, the wire code, then width/height. */
export function orientationPacket(orientation: Orientation): Buffer {
  const { width, height } = displaySize(orientation);
  const packet = Buffer.alloc(16);
  encodeCommand(COMMAND.SET_ORIENTATION).copy(packet);
  packet[6] = orientation + 100;
  packet.writeUInt16BE(width, 7);
  packet.writeUInt16BE(height, 9);
  return packet;
}

/**
 * Brightness is expressed as a percentage here, but the panel scales 0
 * (brightest) to 255 (darkest), so the value is inverted on the wire.
 */
export function brightnessPacket(percent: number): Buffer {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError("brightness must be between 0 and 100");
  }
  return encodeCommand(COMMAND.SET_BRIGHTNESS, Math.round(255 - (percent / 100) * 255));
}
