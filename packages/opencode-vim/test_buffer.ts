import { RGBA } from "@opentui/core";
import { resolveRenderLib } from "@opentui/core/lib/native/index.js";

const lib = resolveRenderLib();
const bufferPtr1 = lib.createOptimizedBuffer(10, 1, "unicode", true, "test1");
const bufferPtr2 = lib.createOptimizedBuffer(10, 1, "unicode", true, "test2");

const bgTransparent = RGBA.fromInts(0, 0, 0, 0); 
const textFg = RGBA.fromInts(204, 204, 204, 255); 
const baseBg = RGBA.fromInts(21, 21, 21, 255);
const overlayBg = RGBA.fromInts(0, 0, 0, 40);

// Frame 1: Base Bg + Text
lib.bufferFillRect(bufferPtr1, 0, 0, 10, 1, baseBg.buffer);
lib.bufferDrawText(bufferPtr1, "A中B", 0, 0, textFg.buffer, bgTransparent.buffer, 0);

// Frame 2: Base Bg + Overlay + Text
lib.bufferFillRect(bufferPtr2, 0, 0, 10, 1, baseBg.buffer);
lib.bufferFillRect(bufferPtr2, 0, 0, 10, 1, overlayBg.buffer);
lib.bufferDrawText(bufferPtr2, "A中B", 0, 0, textFg.buffer, bgTransparent.buffer, 0);

// Dump Frame 1
const size1 = lib.bufferGetRealCharSize(bufferPtr1);
const out1 = new Uint8Array(size1);
const len1 = lib.bufferWriteResolvedChars(bufferPtr1, out1, false);
console.log("Frame 1 Chars:", new TextDecoder().decode(out1.slice(0, len1)));

// Dump Frame 2
const size2 = lib.bufferGetRealCharSize(bufferPtr2);
const out2 = new Uint8Array(size2);
const len2 = lib.bufferWriteResolvedChars(bufferPtr2, out2, false);
console.log("Frame 2 Chars:", new TextDecoder().decode(out2.slice(0, len2)));

// Get the raw cell data for Frame 2
const charPtr = lib.bufferGetCharPtr(bufferPtr2);
const chars = new Uint32Array(lib.memory.buffer, charPtr, 10);
console.log("Frame 2 Raw chars array:", Array.from(chars).map(c => c.toString(16)));
