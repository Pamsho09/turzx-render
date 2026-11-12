import assert from "node:assert/strict";
import test from "node:test";
import { loadFramebuffer, rgb888ToRgb565, solidFramebuffer } from "../src/image.js";
import { Orientation, displaySize, framebufferBytes } from "../src/protocol.js";

test("RGB565 is serialized little-endian", () => {
  // red, green, blue -> 0xf800, 0x07e0, 0x001f with the low byte first
  assert.deepEqual(
    rgb888ToRgb565(Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255])),
    Buffer.from([0x00, 0xf8, 0xe0, 0x07, 0x1f, 0x00]),
  );
});

test("RGB565 truncates the low bits of each channel", () => {
  assert.deepEqual(rgb888ToRgb565(Buffer.from([255, 255, 255])), Buffer.from([0xff, 0xff]));
  assert.deepEqual(rgb888ToRgb565(Buffer.from([0, 0, 0])), Buffer.from([0x00, 0x00]));
});

test("a truncated RGB buffer is rejected rather than silently padded", () => {
  assert.throws(() => rgb888ToRgb565(Buffer.from([255, 0])), /divisible by 3/);
});

test("solid framebuffers repeat one little-endian pixel", () => {
  const frame = solidFramebuffer(2, 3, 255, 0, 0);
  assert.equal(frame.length, 2 * 3 * 2);
  assert.deepEqual(frame, Buffer.from([0x00, 0xf8, 0x00, 0xf8, 0x00, 0xf8, 0x00, 0xf8, 0x00, 0xf8, 0x00, 0xf8]));
});

for (const orientation of [Orientation.Portrait, Orientation.Landscape]) {
  const { width, height } = displaySize(orientation);
  test(`the test pattern fills a ${width}x${height} framebuffer exactly`, async () => {
    const frame = await loadFramebuffer("assets/test.png", width, height);
    assert.equal(frame.length, framebufferBytes(orientation));
  });
}

test("contain pads with the background instead of cropping", async () => {
  // A 480x320 source letterboxed into 320x480 leaves black bars top and bottom.
  const frame = await loadFramebuffer("assets/test.png", 320, 480, { fit: "contain" });
  assert.equal(frame.length, 320 * 480 * 2);
  assert.deepEqual(frame.subarray(0, 2), Buffer.from([0x00, 0x00]));
});
