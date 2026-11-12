import assert from "node:assert/strict";
import test from "node:test";
import {
  NATIVE_HEIGHT,
  NATIVE_WIDTH,
  Orientation,
  bitmapHeader,
  brightnessPacket,
  displaySize,
  encodeCommand,
  framebufferBytes,
  isLandscape,
  orientationPacket,
} from "../src/protocol.js";

test("commands pack four 10-bit coordinates into five bytes", () => {
  // x=0 y=0 ex=479 ey=319, the full-screen landscape bitmap header.
  assert.deepEqual(bitmapHeader(0, 0, 480, 320), Buffer.from([0x00, 0x00, 0x07, 0x7d, 0x3f, 0xc5]));
});

test("coordinates beyond 10 bits are rejected", () => {
  assert.throws(() => encodeCommand(197, 0, 0, 1024, 0), RangeError);
  assert.throws(() => encodeCommand(197, -1, 0, 0, 0), RangeError);
});

test("bitmap header rejects empty rectangles", () => {
  assert.throws(() => bitmapHeader(0, 0, 0, 10), RangeError);
});

test("landscape swaps the panel's native dimensions", () => {
  assert.deepEqual(displaySize(Orientation.Portrait), { width: NATIVE_WIDTH, height: NATIVE_HEIGHT });
  assert.deepEqual(displaySize(Orientation.Landscape), { width: NATIVE_HEIGHT, height: NATIVE_WIDTH });
  assert.equal(isLandscape(Orientation.ReverseLandscape), true);
  assert.equal(isLandscape(Orientation.ReversePortrait), false);
});

test("both orientations need the same number of framebuffer bytes", () => {
  assert.equal(framebufferBytes(Orientation.Portrait), 320 * 480 * 2);
  assert.equal(framebufferBytes(Orientation.Landscape), framebufferBytes(Orientation.Portrait));
});

test("orientation packet carries wire code 102 and 480x320 for landscape", () => {
  assert.deepEqual(
    orientationPacket(Orientation.Landscape),
    Buffer.from([0, 0, 0, 0, 0, 0x79, 102, 0x01, 0xe0, 0x01, 0x40, 0, 0, 0, 0, 0]),
  );
});

test("orientation packet carries wire code 100 and 320x480 for portrait", () => {
  assert.deepEqual(
    orientationPacket(Orientation.Portrait),
    Buffer.from([0, 0, 0, 0, 0, 0x79, 100, 0x01, 0x40, 0x01, 0xe0, 0, 0, 0, 0, 0]),
  );
});

test("brightness percentage is inverted for the panel's 0=brightest scale", () => {
  assert.equal(brightnessPacket(100)[0], 0);
  assert.equal(brightnessPacket(0)[0], 255 >> 2);
  assert.throws(() => brightnessPacket(101), RangeError);
});
