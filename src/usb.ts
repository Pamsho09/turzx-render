import { usb } from "usb";
import {
  USB_BULK_OUT_ENDPOINT,
  USB_INTERFACE,
  USB_PRODUCT_ID,
  USB_VENDOR_ID,
} from "./protocol.js";
import type { DisplayDeviceInfo } from "./types.js";

/**
 * The display is reached through its USB bulk OUT endpoint rather than the
 * /dev/cu.usbmodem* serial port it also exposes.
 *
 * On macOS the CDC serial path corrupts bitmap payloads: pixels arrive intact
 * but land at the wrong offsets, so solid colours look fine while real images
 * tear. That affects every serial client equally, including the reference
 * Python implementation, and is upstream issue #7 (open since 2022). Writing
 * the identical bytes to the bulk endpoint renders correctly.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

/** The package declares this type internally but does not export it. */
type UsbDevice = NonNullable<Awaited<ReturnType<typeof usb.findDeviceByIds>>>;

export interface UsbTransportOptions {
  /** Per-transfer timeout. Large frames are a single transfer. */
  timeoutMs?: number;
}

export class UsbTransport {
  private constructor(
    private readonly device: UsbDevice,
    private readonly timeoutMs: number,
    readonly info: DisplayDeviceInfo,
    private detachedKernelDriver: boolean,
  ) {}

  static async open(options: UsbTransportOptions = {}): Promise<UsbTransport> {
    const device = await usb.findDeviceByIds(USB_VENDOR_ID, USB_PRODUCT_ID);
    if (!device) {
      throw new Error(
        `No display found on USB (expected ${hex(USB_VENDOR_ID)}:${hex(USB_PRODUCT_ID)}). Is it plugged in?`,
      );
    }

    await device.open();
    if (!device.configuration) await device.selectConfiguration(1);

    // macOS binds its CDC driver to this interface; detaching is what frees the
    // endpoint. It is best-effort: claiming still succeeds on some systems.
    let detached = false;
    try {
      await device.detachKernelDriver(USB_INTERFACE);
      detached = true;
    } catch {
      // No kernel driver attached, or the platform does not allow detaching.
    }

    try {
      await device.claimInterface(USB_INTERFACE);
    } catch (error) {
      await device.close().catch(() => undefined);
      throw new Error(
        `Unable to claim USB interface ${USB_INTERFACE}: ${message(error)}. ` +
          "Close any other software using the display and try again.",
      );
    }

    const info: DisplayDeviceInfo = {
      manufacturer: device.manufacturerName ?? undefined,
      product: device.productName ?? undefined,
      serialNumber: device.serialNumber ?? undefined,
      vendorId: USB_VENDOR_ID,
      productId: USB_PRODUCT_ID,
    };

    return new UsbTransport(device, options.timeoutMs ?? DEFAULT_TIMEOUT_MS, info, detached);
  }

  async write(data: Uint8Array): Promise<void> {
    const written = await this.device.nativeTransferOut(
      USB_BULK_OUT_ENDPOINT,
      this.timeoutMs,
      data,
    );
    if (written !== data.length) {
      throw new Error(`Short USB write: sent ${written} of ${data.length} bytes`);
    }
  }

  async close(): Promise<void> {
    await this.device.releaseInterface(USB_INTERFACE).catch(() => undefined);
    // Hand the interface back so the serial port reappears for other tools.
    if (this.detachedKernelDriver) {
      await this.device.attachKernelDriver(USB_INTERFACE).catch(() => undefined);
    }
    await this.device.close().catch(() => undefined);
  }
}

/** Reports the display's USB identity without claiming it. */
export async function findDisplay(): Promise<DisplayDeviceInfo | undefined> {
  const device = await usb.findDeviceByIds(USB_VENDOR_ID, USB_PRODUCT_ID);
  if (!device) return undefined;
  return {
    manufacturer: device.manufacturerName ?? undefined,
    product: device.productName ?? undefined,
    serialNumber: device.serialNumber ?? undefined,
    vendorId: device.vendorId,
    productId: device.productId,
  };
}

function hex(value: number): string {
  return `0x${value.toString(16).padStart(4, "0")}`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
