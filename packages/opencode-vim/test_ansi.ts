import { RGBA } from "@opentui/core";
import { resolveRenderLib } from "@opentui/core/lib/native/index.js";

const lib = resolveRenderLib();
const bufferPtr = lib.createOptimizedBuffer(10, 1, "unicode", true, "test");

const bgTransparent = RGBA.fromInts(0, 0, 0, 0); // Transparent text background
const textFg = RGBA.fromInts(204, 204, 204, 255); // Text color

// 1. Draw the overlay first (zIndex removed)
const overlayBg = RGBA.fromInts(0, 0, 0, 40);
lib.bufferFillRect(bufferPtr, 0, 0, 10, 1, overlayBg.buffer);

// 2. Draw Chinese on top
lib.bufferDrawText(bufferPtr, "中", 0, 0, textFg.buffer, bgTransparent.buffer, 0);

// Inspect after drawing
const realSize = lib.bufferGetRealCharSize(bufferPtr);
const out = new Uint8Array(realSize);
const len = lib.bufferWriteResolvedChars(bufferPtr, out, false);
console.log("After render:", new TextDecoder().decode(out.slice(0, len)));
