#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { TurzxDisplay } from "./display.js";
import { findDisplay } from "./usb.js";
import { Orientation, displaySize } from "./protocol.js";
import type { CliOptions, ResizeFit } from "./types.js";

const USAGE = `Usage: turzx <image> [options]        (in this repo: npm run dev -- <image>)

  --portrait          320x480 instead of the default 480x320 landscape
  --contain           fit the whole image and pad, instead of filling the panel
  --brightness <0-100>
  --clear             blank the panel (with no image, this is all it does)
  --list              show the display's USB identity and exit`;

const FITS: ResizeFit[] = ["cover", "contain"];

function parseCli(args: string[]): CliOptions {
  const options: CliOptions = {
    orientation: Orientation.Landscape,
    clear: false,
    list: false,
    fit: "cover",
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    switch (arg) {
      case "--portrait": options.orientation = Orientation.Portrait; break;
      case "--landscape": options.orientation = Orientation.Landscape; break;
      case "--contain": options.fit = "contain"; break;
      case "--cover": options.fit = "cover"; break;
      case "--clear": options.clear = true; break;
      case "--list": options.list = true; break;
      case "--help": case "-h": console.log(USAGE); process.exit(0); break;
      case "--brightness": {
        const value = Number(args[++index]);
        if (!Number.isFinite(value) || value < 0 || value > 100) {
          throw new Error("--brightness requires a number between 0 and 100");
        }
        options.brightness = value;
        break;
      }
      default:
        if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}\n\n${USAGE}`);
        if (options.image) throw new Error(`Unexpected argument: ${arg}`);
        options.image = arg;
    }
  }

  if (!options.image && !options.clear && !options.list) throw new Error(USAGE);
  if (!FITS.includes(options.fit)) throw new Error(`Unsupported fit: ${options.fit}`);
  return options;
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));

  if (options.list) {
    const device = await findDisplay();
    if (!device) {
      console.log("No display found on USB.");
      process.exitCode = 1;
      return;
    }
    console.log(`manufacturer: ${device.manufacturer ?? "unknown"}`);
    console.log(`product:      ${device.product ?? "unknown"}`);
    console.log(`serial:       ${device.serialNumber ?? "unknown"}`);
    console.log(`usb id:       ${hex(device.vendorId)}:${hex(device.productId)}`);
    return;
  }

  const imagePath = options.image ? resolve(options.image) : undefined;
  if (imagePath) {
    try {
      await stat(imagePath);
    } catch {
      throw new Error(`Image not found: ${imagePath}`);
    }
  }

  const { width, height } = displaySize(options.orientation);
  console.log(`[TURZX] Opening display over USB (${width}x${height})...`);
  const display = await TurzxDisplay.open({
    orientation: options.orientation,
    ...(options.brightness !== undefined ? { brightness: options.brightness } : {}),
  });

  let interrupted = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (interrupted) return;
    interrupted = true;
    console.log(`\n[TURZX] ${signal}, releasing the USB interface...`);
    void display.close().finally(() => process.exit(130));
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  try {
    const device = display.device;
    console.log(`[TURZX] ${device.manufacturer ?? "?"} ${device.product ?? "?"} (${device.serialNumber ?? "?"})`);

    if (options.clear) {
      console.log("[TURZX] Clearing...");
      await display.clear();
    }

    if (imagePath) {
      console.log(`[TURZX] Drawing ${imagePath} (${options.fit})`);
      const started = performance.now();
      await display.drawImage(imagePath, { fit: options.fit });
      console.log(`[TURZX] Done in ${Math.round(performance.now() - started)} ms`);
    }
  } finally {
    await display.close();
  }
}

function hex(value: number): string {
  return `0x${value.toString(16).padStart(4, "0")}`;
}

main().catch((error: unknown) => {
  console.error(`[TURZX] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
