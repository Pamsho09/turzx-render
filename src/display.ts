import {
  BYTES_PER_PIXEL,
  COMMAND,
  Orientation,
  bitmapHeader,
  brightnessPacket,
  displaySize,
  encodeCommand,
  orientationPacket,
} from "./protocol.js";
import { loadFramebuffer, solidFramebuffer } from "./image.js";
import { UsbTransport } from "./usb.js";
import type {
  DisplayDeviceInfo,
  DisplayOptions,
  DrawImageOptions,
  DrawRegionOptions,
  ImageSource,
} from "./types.js";

/**
 * The panel acknowledges nothing, so commands and their payloads are separated
 * by a short settle time. Values match the working reference sequence.
 */
const ORIENTATION_SETTLE_MS = 50;
const COMMAND_SETTLE_MS = 20;
/** Grace period for the panel to blank its output before pixels start landing. */
const BLANK_SETTLE_MS = 40;

/**
 * Driver for the TURZX / Turing / UsbMonitor 3.5" display.
 *
 * ```ts
 * const display = await TurzxDisplay.open();
 * await display.drawImage("photo.png");
 * await display.close();
 * ```
 */
export class TurzxDisplay {
  #orientation: Orientation;
  #pending: Promise<unknown> = Promise.resolve();
  #closed = false;

  private constructor(
    private readonly transport: UsbTransport,
    orientation: Orientation,
  ) {
    this.#orientation = orientation;
  }

  static async open(options: DisplayOptions = {}): Promise<TurzxDisplay> {
    const orientation = options.orientation ?? Orientation.Landscape;
    const transport = await UsbTransport.open({ timeoutMs: options.timeoutMs });
    const display = new TurzxDisplay(transport, orientation);
    try {
      await display.setOrientation(orientation);
      if (options.brightness !== undefined) await display.setBrightness(options.brightness);
    } catch (error) {
      await display.close();
      throw error;
    }
    return display;
  }

  get device(): DisplayDeviceInfo {
    return this.transport.info;
  }

  get orientation(): Orientation {
    return this.#orientation;
  }

  get width(): number {
    return displaySize(this.#orientation).width;
  }

  get height(): number {
    return displaySize(this.#orientation).height;
  }

  async setOrientation(orientation: Orientation): Promise<void> {
    await this.#exclusive(async () => {
      await this.transport.write(orientationPacket(orientation));
      this.#orientation = orientation;
      await delay(ORIENTATION_SETTLE_MS);
    });
  }

  async setBrightness(percent: number): Promise<void> {
    await this.#exclusive(() => this.transport.write(brightnessPacket(percent)));
  }

  async screenOn(): Promise<void> {
    await this.#exclusive(() => this.transport.write(encodeCommand(COMMAND.SCREEN_ON)));
  }

  async screenOff(): Promise<void> {
    await this.#exclusive(() => this.transport.write(encodeCommand(COMMAND.SCREEN_OFF)));
  }

  /** Blanks the panel. The firmware only clears correctly from portrait. */
  async clear(): Promise<void> {
    const restore = this.#orientation;
    await this.#exclusive(async () => {
      await this.transport.write(orientationPacket(Orientation.Portrait));
      await delay(ORIENTATION_SETTLE_MS);
      await this.transport.write(encodeCommand(COMMAND.CLEAR));
      await delay(ORIENTATION_SETTLE_MS);
      await this.transport.write(orientationPacket(restore));
      await delay(ORIENTATION_SETTLE_MS);
    });
  }

  /** Fills the whole panel with one colour. */
  async fill(r: number, g: number, b: number): Promise<void> {
    const { width, height } = displaySize(this.#orientation);
    await this.drawRegion(0, 0, width, height, solidFramebuffer(width, height, r, g, b));
  }

  /** Decodes an image, scales it to the panel and draws it full-screen. */
  async drawImage(source: ImageSource, options: DrawImageOptions = {}): Promise<void> {
    const { width, height } = displaySize(this.#orientation);
    const pixels = await loadFramebuffer(source, width, height, options);
    await this.drawRegion(0, 0, width, height, pixels, options);
  }

  /**
   * Draws raw RGB565 little-endian pixels into a rectangle.
   *
   * The panel has no back buffer: it shows its memory as the bytes land, so a
   * full frame visibly wipes top to bottom over ~1.9s. `atomic` hides that by
   * blanking the panel for the duration and switching it back on, which costs
   * about 40ms. Use it for full-screen repaints; on a small region it flashes
   * the whole display for a change that would barely have been noticed.
   */
  async drawRegion(
    x: number,
    y: number,
    width: number,
    height: number,
    pixels: Buffer,
    options: DrawRegionOptions = {},
  ): Promise<void> {
    const bounds = displaySize(this.#orientation);
    if (x < 0 || y < 0 || x + width > bounds.width || y + height > bounds.height) {
      throw new RangeError(
        `Region ${width}x${height} at (${x},${y}) does not fit the ${bounds.width}x${bounds.height} panel`,
      );
    }
    const expected = width * height * BYTES_PER_PIXEL;
    if (pixels.length !== expected) {
      throw new Error(`Invalid payload: expected ${expected} bytes, received ${pixels.length}`);
    }

    await this.#exclusive(async () => {
      if (!options.atomic) {
        await this.#blit(x, y, width, height, pixels);
        return;
      }
      await this.transport.write(encodeCommand(COMMAND.SCREEN_OFF));
      await delay(BLANK_SETTLE_MS);
      try {
        await this.#blit(x, y, width, height, pixels);
      } finally {
        // Whatever happened, the panel must never be left switched off.
        await this.transport.write(encodeCommand(COMMAND.SCREEN_ON));
      }
    });
  }

  async #blit(x: number, y: number, width: number, height: number, pixels: Buffer): Promise<void> {
    await this.transport.write(bitmapHeader(x, y, width, height));
    await delay(COMMAND_SETTLE_MS);
    await this.transport.write(pixels);
  }

  /**
   * Escape hatch for commands this class does not wrap, such as `TO_BLACK`.
   *
   * Goes through the same lock as every other operation, so it can never land
   * in the middle of a bitmap payload — writing to the endpoint yourself while
   * a transfer is in flight desynchronizes the firmware's parser and the panel
   * renders garbage until the next full frame.
   *
   * ```ts
   * await display.sendRaw(encodeCommand(COMMAND.TO_BLACK));
   * ```
   */
  async sendRaw(bytes: Uint8Array): Promise<void> {
    if (bytes.length === 0) throw new RangeError("sendRaw needs at least one byte");
    await this.#exclusive(() => this.transport.write(bytes));
  }

  /**
   * Reboots the panel. The USB device re-enumerates, so this instance is closed
   * and a new one must be opened afterwards.
   */
  async reset(): Promise<void> {
    await this.#exclusive(() => this.transport.write(encodeCommand(COMMAND.RESET)));
    await this.close();
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#pending.catch(() => undefined);
    await this.transport.close();
  }

  /** Serializes traffic: a half-written bitmap would desynchronize the parser. */
  #exclusive<T>(task: () => Promise<T>): Promise<T> {
    if (this.#closed) return Promise.reject(new Error("Display is closed"));
    const result = this.#pending.then(task, task);
    this.#pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function delay(milliseconds: number): Promise<void> {
  return milliseconds > 0 ? new Promise((resolve) => setTimeout(resolve, milliseconds)) : Promise.resolve();
}
