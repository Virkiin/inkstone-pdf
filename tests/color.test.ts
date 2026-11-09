import test from "node:test";
import assert from "node:assert/strict";
import { hexToHsl, hslToHex, normalizeHex } from "../src/color";

test("hexToHsl reads the hue of primary colours", () => {
	assert.deepEqual(hexToHsl("#ff0000"), { h: 0, s: 100, l: 50 });
	assert.deepEqual(hexToHsl("#00ff00"), { h: 120, s: 100, l: 50 });
	assert.deepEqual(hexToHsl("#0000ff"), { h: 240, s: 100, l: 50 });
});

test("hexToHsl handles greys and black", () => {
	assert.deepEqual(hexToHsl("#000000"), { h: 0, s: 0, l: 0 });
	assert.deepEqual(hexToHsl("#808080"), { h: 0, s: 0, l: 50 });
	assert.deepEqual(hexToHsl("#ffffff"), { h: 0, s: 0, l: 100 });
});

test("hslToHex round-trips a few colours within rounding", () => {
	for (const hex of ["#e03131", "#1971c2", "#2f9e44", "#8b5a2b", "#868e96"]) {
		const hsl = hexToHsl(hex);
		const back = hslToHex(hsl.h, hsl.s, hsl.l);
		// Integer H/S/L loses a hair of precision; a couple of units per channel
		// is invisible and keeps the editor honest.
		const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
		const b = [1, 3, 5].map((i) => parseInt(back.slice(i, i + 2), 16));
		for (let i = 0; i < 3; i++) {
			assert.ok(Math.abs(a[i] - b[i]) <= 3, `${hex} -> ${back} channel ${i}`);
		}
	}
});

test("hslToHex wraps the hue and clamps the rest", () => {
	assert.equal(hslToHex(400, 100, 50), hslToHex(40, 100, 50));
	assert.equal(hslToHex(-120, 100, 50), hslToHex(240, 100, 50));
	assert.equal(hslToHex(0, 500, 50), hslToHex(0, 100, 50));
	assert.equal(hslToHex(0, 100, 500), "#ffffff");
});

test("normalizeHex accepts short and bare forms", () => {
	assert.equal(normalizeHex("#abc"), "#aabbcc");
	assert.equal(normalizeHex("aabbcc"), "#aabbcc");
	assert.equal(normalizeHex("#AABBCC"), "#aabbcc");
	assert.equal(normalizeHex("nope"), null);
});
