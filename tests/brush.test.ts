import test from "node:test";
import assert from "node:assert/strict";
import {
	autoPresetName,
	clonePresets,
	colorName,
	eraserPresetName,
	formatWidth,
} from "../src/brush";

test("colorName picks the nearest readable name", () => {
	assert.equal(colorName("#e03131"), "红");
	assert.equal(colorName("#e03132"), "红");
	assert.equal(colorName("#1971c2"), "蓝");
	assert.equal(colorName("#1e1e1e"), "黑");
	assert.equal(colorName("#8b5a2b"), "棕");
});

test("colorName falls back to the raw value for garbage input", () => {
	assert.equal(colorName("not-a-color"), "not-a-color");
	assert.equal(colorName("#12"), "#12");
});

test("colorName expands 3-digit hex", () => {
	assert.equal(colorName("#f00"), "红");
});

test("formatWidth keeps one decimal and drops the trailing zero", () => {
	assert.equal(formatWidth(2.5), "2.5");
	assert.equal(formatWidth(3), "3");
	assert.equal(formatWidth(2.46), "2.5");
	assert.equal(formatWidth(12.04), "12");
});

test("autoPresetName is readable Chinese", () => {
	assert.equal(autoPresetName("#e03131", 2.5), "红 · 2.5");
	assert.equal(autoPresetName("#1971c2", 5), "蓝 · 5");
});

test("eraserPresetName describes the region", () => {
	assert.equal(eraserPresetName("rect", 16), "矩形 · 16");
	assert.equal(eraserPresetName("lasso", 8), "套索 · 8");
});

test("clonePresets copies entries instead of sharing them", () => {
	const source = [{ id: "p1", name: "红 · 2.5" }];
	const copy = clonePresets(source);
	assert.deepEqual(copy, source);
	copy[0].name = "改名";
	assert.equal(source[0].name, "红 · 2.5", "the source must stay untouched");
	assert.deepEqual(clonePresets(undefined), []);
});
