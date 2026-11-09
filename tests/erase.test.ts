import test from "node:test";
import assert from "node:assert/strict";
import {
	clipRuns,
	densify,
	eraseInk,
	flattenStroke,
	polygonRegion,
	rectRegion,
	regionTouches,
	splitByRegion,
	swathRegion,
} from "../src/erase";
import type { Stroke } from "../src/types";

const W = 800;
const H = 1000;

function stroke(kind: Stroke["kind"], points: number[], width = 0.003): Stroke {
	return { id: "s", kind, page: 1, color: "#000", width, opacity: 1, points };
}

test("rectRegion is inclusive and order independent", () => {
	const inside = rectRegion(200, 500, 100, 300);
	assert.equal(inside(150, 400), true);
	assert.equal(inside(99, 400), false);
	assert.equal(inside(150, 299), false);
});

test("polygonRegion handles a triangle", () => {
	const inside = polygonRegion([
		[100, 100],
		[300, 100],
		[200, 300],
	]);
	assert.equal(inside(200, 150), true);
	assert.equal(inside(120, 280), false);
});

test("swathRegion covers the traced circles", () => {
	const inside = swathRegion(
		[
			[100, 100],
			[200, 100],
		],
		10,
	);
	assert.equal(inside(150, 105), true);
	assert.equal(inside(150, 130), false);
	assert.equal(inside(400, 400), false);
});

test("flattenStroke samples rect and ellipse outlines", () => {
	const rect = stroke("rect", [0.1, 0.1, 0.5, 0.4, 0.4, 0.5]);
	const rectPaths = flattenStroke(rect, W, H);
	assert.equal(rectPaths.length, 1);
	assert.equal(rectPaths[0].points.length, 5);
	assert.equal(rectPaths[0].points[0].x, 80);
	assert.equal(rectPaths[0].points[0].y, 100);

	const ellipse = stroke("ellipse", [0.1, 0.1, 0.5, 0.4, 0.4, 0.5]);
	assert.ok(flattenStroke(ellipse, W, H)[0].points.length > 32);
});

test("flattenStroke keeps the arrow head as its own path", () => {
	const arrow = stroke("arrow", [0.1, 0.1, 0.5, 0.6, 0.5, 0.5]);
	const paths = flattenStroke(arrow, W, H);
	assert.equal(paths.length, 2);
	assert.ok(paths[1].points.length >= 4);
	assert.equal(paths[1].fill, true);
});

test("densify keeps ends and interpolates pressure", () => {
	const out = densify(
		[
			{ x: 0, y: 0, p: 0.2 },
			{ x: 10, y: 0, p: 0.8 },
		],
		2,
	);
	assert.deepEqual([out[0].x, out[0].y], [0, 0]);
	assert.deepEqual([out[out.length - 1].x, out[out.length - 1].y], [10, 0]);
	assert.equal(out.length, 6);
	assert.ok(Math.abs(out[3].p - 0.56) < 0.02);
});

test("splitByRegion cuts a line into the parts outside the region", () => {
	const flat = densify(
		[
			{ x: 0, y: 50, p: 0.5 },
			{ x: 300, y: 50, p: 0.5 },
		],
		1,
	);
	const inside = rectRegion(100, 0, 200, 100);
	assert.equal(regionTouches(flat, inside), true);
	const runs = splitByRegion(flat, inside);
	assert.equal(runs.length, 2);
	assert.equal(runs[0][0].x, 0);
	assert.equal(runs[1][runs[1].length - 1].x, 300);
	for (const run of runs) {
		for (const point of run) assert.ok(point.x < 101 || point.x > 199, `point ${point.x} inside`);
	}
});

test("splitByRegion returns nothing when the whole stroke is covered", () => {
	const flat = densify(
		[
			{ x: 120, y: 50, p: 0.5 },
			{ x: 180, y: 50, p: 0.5 },
		],
		1,
	);
	const runs = splitByRegion(flat, rectRegion(100, 0, 200, 100));
	assert.equal(runs.length, 0);
});

test("erasing an arrow keeps the head as its own piece", () => {
	const arrow = stroke("arrow", [0.1, 0.5, 0.5, 0.5, 0.6, 0.5]);
	const strokes = [arrow];
	// Rect over the middle of the shaft, well away from the head.
	const changed = eraseInk(
		strokes,
		1,
		{ kind: "rect", x0: 0.3 * W, y0: 0, x1: 0.35 * W, y1: H },
		"partial",
		W,
		H,
		() => "x",
	);
	assert.equal(changed, 1);
	assert.ok(strokes.length >= 2, "the shaft is cut and the head survives");
	for (const piece of strokes) {
		assert.ok(piece.rings && piece.rings.length >= 1, "pieces are outlines");
	}
});

test("clip cuts on the boundary instead of at a sampled point", () => {
	const line = [
		{ x: 0, y: 50, p: 0.5 },
		{ x: 300, y: 50, p: 0.5 },
	];
	const runs = clipRuns(line, rectRegion(100, 0, 200, 100));
	assert.equal(runs.length, 2);
	const leftEnd = runs[0][runs[0].length - 1].x;
	const rightStart = runs[1][0].x;
	assert.ok(Math.abs(leftEnd - 100) < 0.1, `left cut at ${leftEnd}`);
	assert.ok(Math.abs(rightStart - 200) < 0.1, `right cut at ${rightStart}`);
});

test("an eraser inside a fat stroke leaves an inner hole", () => {
	const fat = stroke("pen", [0.1, 0.5, 0.5, 0.5, 0.5, 0.5], 0.03);
	const strokes = [fat];
	const changed = eraseInk(
		strokes,
		1,
		{ kind: "swath", points: [[400, 500]], radius: 6 },
		"partial",
		W,
		H,
		() => "h",
	);
	assert.equal(changed, 1);
	assert.equal(strokes.length, 1, "one stroke stays one stroke");
	assert.equal(strokes[0].rings?.length, 2, "outer contour plus a hole");
});

test("an eraser across a thin stroke splits it into pieces", () => {
	const thin = stroke("pen", [0.1, 0.5, 0.5, 0.5, 0.5, 0.5], 0.004);
	const strokes = [thin];
	const changed = eraseInk(
		strokes,
		1,
		{ kind: "swath", points: [[240, 400], [240, 600]], radius: 6 },
		"partial",
		W,
		H,
		() => "c",
	);
	assert.equal(changed, 1);
	assert.equal(strokes.length, 2);
	for (const piece of strokes) assert.equal(piece.rings?.length, 1);
});

test("an eraser that misses leaves the stroke untouched", () => {
	const thin = stroke("pen", [0.1, 0.5, 0.5, 0.5, 0.5, 0.5], 0.004);
	const strokes = [thin];
	const changed = eraseInk(
		strokes,
		1,
		{ kind: "swath", points: [[400, 900]], radius: 6 },
		"partial",
		W,
		H,
		() => "m",
	);
	assert.equal(changed, 0);
	assert.equal(strokes.length, 1);
	assert.equal(strokes[0], thin);
});
