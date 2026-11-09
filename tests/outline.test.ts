import test from "node:test";
import assert from "node:assert/strict";
import { strokeToPaths } from "../src/outline";
import type { Stroke } from "../src/types";

const W = 800;
const H = 1000;

function stroke(kind: Stroke["kind"], points: number[], width = 0.01, extra: Partial<Stroke> = {}): Stroke {
	return { id: "s", kind, page: 1, color: "#000", width, opacity: 1, points, ...extra };
}

function bbox(path: Array<{ x: number; y: number }>): { w: number; h: number; minX: number; minY: number; maxX: number; maxY: number } {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const point of path) {
		minX = Math.min(minX, point.x);
		maxX = Math.max(maxX, point.x);
		minY = Math.min(minY, point.y);
		maxY = Math.max(maxY, point.y);
	}
	return { w: (maxX - minX) / 100, h: (maxY - minY) / 100, minX: minX / 100, minY: minY / 100, maxX: maxX / 100, maxY: maxY / 100 };
}

test("freehand outline keeps the pressure taper", () => {
	const tapered = stroke("pen", [0.1, 0.5, 0.15, 0.5, 0.5, 0.9], 0.04);
	const paths = strokeToPaths(tapered, W, H);
	assert.ok(paths.length >= 1);
	const path = paths[0];
	const thin = path.filter((p) => p.x / 100 < 0.2 * W);
	const thick = path.filter((p) => p.x / 100 > 0.42 * W);
	const spread = (points: typeof path) => {
		const ys = points.map((p) => p.y / 100);
		return Math.max(...ys) - Math.min(...ys);
	};
	assert.ok(thin.length > 0 && thick.length > 0);
	assert.ok(
		spread(thick) > spread(thin) * 1.5,
		`thick end ${spread(thick)} should be wider than thin end ${spread(thin)}`,
	);
});

test("a rect shape keeps its rectangle outline", () => {
	const rect = stroke("rect", [0.2, 0.2, 0.5, 0.6, 0.6, 0.5], 0.01);
	const paths = strokeToPaths(rect, W, H);
	assert.equal(paths.length, 2, "outline of a rectangle is a ring");
	const box = bbox(paths[0]);
	const outer = paths
		.map((path) => bbox(path))
		.sort((a, b) => b.w * b.h - a.w * a.h)[0];
	// outer edge = rectangle grown by half the stroke width (~4px)
	assert.ok(Math.abs(outer.minX - (0.2 * W - 4)) < 3, `left ${outer.minX}`);
	assert.ok(Math.abs(outer.maxX - (0.6 * W + 4)) < 3, `right ${outer.maxX}`);
	assert.ok(outer.h > 0.4 * H, "the outline is a rectangle, not a line");
	assert.ok(box.w > 0, "inner ring exists");
});

test("a filled polygon is used as an area, not inflated", () => {
	const triangle = stroke(
		"polygon",
		[0.4, 0.2, 0.5, 0.6, 0.2, 0.5, 0.5, 0.3, 0.5],
		0.02,
		{ fill: true },
	);
	const paths = strokeToPaths(triangle, W, H);
	assert.equal(paths.length, 1);
	const box = bbox(paths[0]);
	assert.ok(Math.abs(box.minX - 0.4 * W) < 2, `left ${box.minX}`);
	assert.ok(Math.abs(box.maxX - 0.6 * W) < 2, `right ${box.maxX}`);
});

test("a line shape becomes a capsule of the stroke width", () => {
	const line = stroke("line", [0.2, 0.5, 0.5, 0.5, 0.5, 0.5], 0.02);
	const paths = strokeToPaths(line, W, H);
	assert.equal(paths.length, 1);
	const box = bbox(paths[0]);
	assert.ok(Math.abs(box.h - 16) < 3, `height ${box.h} should be ~2 * 8px`);
	assert.ok(Math.abs(box.w - (0.3 * W + 16)) < 4, `width ${box.w}`);
});

function pointInPath(path: Array<{ x: number; y: number }>, x: number, y: number): boolean {
	let inside = false;
	for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
		const xi = path[i].x;
		const yi = path[i].y;
		const xj = path[j].x;
		const yj = path[j].y;
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

test("a sharp turn is filled instead of leaving a notch", () => {
	// V shape with a ~90 degree kink at (0.3, 0.3)
	const zig = stroke("pen", [0.2, 0.5, 0.5, 0.3, 0.3, 0.5, 0.4, 0.5, 0.5], 0.04);
	const paths = strokeToPaths(zig, W, H);
	assert.equal(paths.length, 1);
	const path = paths[0].map((p) => ({ x: p.x / 100, y: p.y / 100 }));
	// just outside the kink, still within the stroke radius: must be covered
	assert.ok(
		pointInPath(path, 0.3 * W + 6, 0.3 * H + 6),
		"the outer corner of the kink is not filled",
	);
});
