import test from "node:test";
import assert from "node:assert/strict";
import { migratePageStrokes } from "../src/migrate";
import { createDoc } from "../src/doc";
import type { InkDoc, Stroke } from "../src/types";

const W = 800;
const H = 1000;
let counter = 0;
const nextId = () => `p${++counter}`;

function make(
	kind: Stroke["kind"],
	points: number[],
	page = 1,
	width = 0.01,
): Stroke {
	return { id: `s${++counter}`, kind, page, color: "#000", width, opacity: 1, points };
}

function docWith(...strokes: Stroke[]): InkDoc {
	const doc = createDoc("a.pdf");
	doc.layers[0].strokes.push(...strokes);
	return doc;
}

test("migration is a no-op without eraser masks", () => {
	const doc = docWith(make("pen", [0.1, 0.1, 0.5, 0.3, 0.1, 0.5]));
	assert.equal(migratePageStrokes(doc, 1, W, H, nextId), null);
});

test("a rect mask over the middle splits the ink and disappears", () => {
	const ink = make("pen", [0.1, 0.1, 0.5, 0.5, 0.1, 0.5]);
	// Rect from (0.3, 0) to (0.4, 0.4): cuts the line but leaves both ends.
	const mask = make("eraser-rect", [0.3, 0.0, 0.5, 0.4, 0.4, 0.5], 1, 0.01);
	const doc = docWith(ink, mask);
	const result = migratePageStrokes(doc, 1, W, H, nextId);
	assert.ok(result);
	assert.equal(result!.masks, 1);
	const strokes = doc.layers[0].strokes;
	assert.equal(strokes.some((stroke) => stroke.kind === "eraser-rect"), false);
	assert.equal(strokes.length, 2);
	for (const stroke of strokes) {
		for (let i = 0; i < stroke.points.length; i += 3) {
			assert.ok(stroke.points[i] < 0.32 || stroke.points[i] > 0.39);
		}
	}
});

test("a fully covered stroke is removed entirely", () => {
	const ink = make("pen", [0.3, 0.3, 0.5, 0.4, 0.3, 0.5]);
	const mask = make("eraser-rect", [0.2, 0.2, 0.5, 0.6, 0.6, 0.5], 1, 0.01);
	const doc = docWith(ink, mask);
	migratePageStrokes(doc, 1, W, H, nextId);
	assert.equal(doc.layers[0].strokes.length, 0);
});

test("migration keeps pressure so the split keeps its taper", () => {
	const ink = make("pen", [0.1, 0.1, 0.2, 0.5, 0.1, 0.9]);
	const mask = make("eraser-rect", [0.0, 0.0, 0.5, 0.1, 0.0, 0.5], 1, 0.01);
	const doc = docWith(ink, mask);
	migratePageStrokes(doc, 1, W, H, nextId);
	const pieces = doc.layers[0].strokes;
	assert.ok(pieces.length >= 1);
	const pressures = new Set<number>();
	for (const piece of pieces) {
		for (let i = 2; i < piece.points.length; i += 3) pressures.add(piece.points[i]);
	}
	assert.ok(pressures.size > 1, "pressure values were flattened to one value");
});

test("only the requested page is migrated", () => {
	const page1 = make("pen", [0.1, 0.1, 0.5, 0.3, 0.1, 0.5], 1);
	const page2 = make("pen", [0.1, 0.1, 0.5, 0.3, 0.1, 0.5], 2);
	const mask = make("eraser-rect", [0.2, 0.0, 0.5, 0.1, 0.4, 0.5], 1, 0.01);
	const doc = docWith(page1, page2, mask);
	migratePageStrokes(doc, 1, W, H, nextId);
	assert.equal(
		doc.layers[0].strokes.filter((stroke) => stroke.page === 2).length,
		1,
	);
	assert.equal(
		doc.layers[0].strokes.some((stroke) => stroke.kind === "eraser-rect"),
		false,
	);
});
