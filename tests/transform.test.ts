import test from "node:test";
import assert from "node:assert/strict";
import type { Stroke } from "../src/types";
import {
	applyTransform,
	boundsOfSnapshots,
	restoreStroke,
	snapshotStroke,
} from "../src/transform";

const W = 800;
const H = 1000;

function penStroke(points: number[]): Stroke {
	return {
		id: "s1",
		kind: "pen",
		page: 1,
		color: "#000000",
		width: 2 / W,
		opacity: 1,
		points,
	};
}

const close = (a: number, b: number, tolerance = 1e-9): void => {
	assert.ok(Math.abs(a - b) <= tolerance, `${a} should be close to ${b}`);
};

test("scale keeps the pivot pinned and doubles the geometry", () => {
	const stroke = penStroke([0.2, 0.2, 0.5, 0.4, 0.3, 0.5]);
	const snapshot = snapshotStroke(stroke);
	applyTransform(stroke, snapshot, {
		scaleX: 2,
		scaleY: 2,
		rotate: 0,
		cx: 0.2 * W,
		cy: 0.2 * H,
		pageWidth: W,
		pageHeight: H,
	});
	close(stroke.points[0], 0.2);
	close(stroke.points[1], 0.2);
	close(stroke.points[3], 0.6);
	close(stroke.points[4], 0.4);
	close(stroke.width, 4 / W);
	// Pressure is untouched: scaling must not flatten the pen.
	close(stroke.points[2], 0.5);
});

test("a transform is always applied to the snapshot, so it never drifts", () => {
	const stroke = penStroke([0.1, 0.1, 0.5, 0.3, 0.5, 0.5]);
	const snapshot = snapshotStroke(stroke);
	const base = { rotate: 0, cx: 0, cy: 0, pageWidth: W, pageHeight: H };
	applyTransform(stroke, snapshot, { ...base, scaleX: 2, scaleY: 2 });
	const once = stroke.points.slice();
	applyTransform(stroke, snapshot, { ...base, scaleX: 2, scaleY: 2 });
	assert.deepEqual(stroke.points, once);
});

test("a non-uniform scale stretches each axis independently", () => {
	const stroke = penStroke([0.2, 0.2, 0.5, 0.4, 0.3, 0.5]);
	const snapshot = snapshotStroke(stroke);
	applyTransform(stroke, snapshot, {
		scaleX: 2,
		scaleY: 0.5,
		rotate: 0,
		cx: 0.2 * W,
		cy: 0.2 * H,
		pageWidth: W,
		pageHeight: H,
	});
	close(stroke.points[3], 0.6);
	close(stroke.points[4], 0.25);
	// Width follows the geometric mean, so 2x * 0.5x leaves the pen as it was.
	close(stroke.width, snapshot.width);
});

test("a rect stays a rect under a non-uniform scale", () => {
	const rect: Stroke = {
		id: "r1",
		kind: "rect",
		page: 1,
		color: "#000000",
		width: 2 / W,
		opacity: 1,
		points: [0.2, 0.2, 0.5, 0.5, 0.6, 0.5],
	};
	const snapshot = snapshotStroke(rect);
	applyTransform(rect, snapshot, {
		scaleX: 2,
		scaleY: 0.5,
		rotate: 0,
		cx: 0.2 * W,
		cy: 0.2 * H,
		pageWidth: W,
		pageHeight: H,
	});
	assert.equal(rect.kind, "rect");
	close(rect.points[3], 0.2 + 0.3 * 2);
	close(rect.points[4], 0.2 + 0.4 * 0.5);
});

test("rotation bakes a rect into a polygon", () => {
	const rect: Stroke = {
		id: "r1",
		kind: "rect",
		page: 1,
		color: "#000000",
		width: 2 / W,
		opacity: 1,
		points: [0.2, 0.2, 0.5, 0.6, 0.6, 0.5],
	};
	const snapshot = snapshotStroke(rect);
	applyTransform(rect, snapshot, {
		scaleX: 1,
		scaleY: 1,
		rotate: Math.PI / 2,
		cx: 0.4 * W,
		cy: 0.4 * H,
		pageWidth: W,
		pageHeight: H,
	});
	assert.equal(rect.kind, "polygon");
	assert.equal(rect.points.length, 12, "four corners, one point each");
	// A 90° turn swaps the box dimensions (0.4 x 0.4 page units, page 800x1000).
	const xs = [rect.points[0], rect.points[3], rect.points[6], rect.points[9]];
	const ys = [rect.points[1], rect.points[4], rect.points[7], rect.points[10]];
	close(Math.max(...xs) - Math.min(...xs), (0.4 * H) / W, 1e-6);
	close(Math.max(...ys) - Math.min(...ys), (0.4 * W) / H, 1e-6);
});

test("scaling a rect without rotation keeps it a rect", () => {
	const rect: Stroke = {
		id: "r1",
		kind: "rect",
		page: 1,
		color: "#000000",
		width: 2 / W,
		opacity: 1,
		points: [0.2, 0.2, 0.5, 0.5, 0.6, 0.5],
	};
	const snapshot = snapshotStroke(rect);
	applyTransform(rect, snapshot, {
		scaleX: 1.5,
		scaleY: 1.5,
		rotate: 0,
		cx: 0.2 * W,
		cy: 0.2 * H,
		pageWidth: W,
		pageHeight: H,
	});
	assert.equal(rect.kind, "rect");
	close(rect.points[3], 0.2 + 0.3 * 1.5);
	close(rect.points[4], 0.2 + 0.4 * 1.5);
});

test("rings scale together with the outline", () => {
	const stroke: Stroke = {
		id: "o1",
		kind: "pen",
		page: 1,
		color: "#000000",
		width: 2 / W,
		opacity: 1,
		points: [0.5, 0.5, 0.5],
		rings: [
			[0.4, 0.4, 0.6, 0.4, 0.6, 0.6, 0.4, 0.6],
			[0.45, 0.45, 0.55, 0.45, 0.55, 0.55, 0.45, 0.55],
		],
	};
	const snapshot = snapshotStroke(stroke);
	applyTransform(stroke, snapshot, {
		scaleX: 2,
		scaleY: 2,
		rotate: 0,
		cx: 0.4 * W,
		cy: 0.4 * H,
		pageWidth: W,
		pageHeight: H,
	});
	assert.ok(stroke.rings);
	close(stroke.rings![0][0], 0.4);
	close(stroke.rings![0][2], 0.8);
	close(stroke.rings![1][2], 0.7, 1e-9);
	assert.equal(stroke.rings![1].length, 8);
});

test("restoreStroke puts everything back, including the shape kind", () => {
	const rect: Stroke = {
		id: "r1",
		kind: "rect",
		page: 1,
		color: "#000000",
		width: 2 / W,
		opacity: 1,
		points: [0.2, 0.2, 0.5, 0.6, 0.6, 0.5],
	};
	const snapshot = snapshotStroke(rect);
	applyTransform(rect, snapshot, {
		scaleX: 3,
		scaleY: 3,
		rotate: Math.PI / 4,
		cx: 0.4 * W,
		cy: 0.4 * H,
		pageWidth: W,
		pageHeight: H,
	});
	restoreStroke(rect, snapshot);
	assert.equal(rect.kind, "rect");
	assert.deepEqual(rect.points, snapshot.points);
	assert.equal(rect.rings, undefined);
	close(rect.width, snapshot.width);
});

test("boundsOfSnapshots covers points and rings", () => {
	const stroke: Stroke = {
		id: "o1",
		kind: "pen",
		page: 1,
		color: "#000000",
		width: 2 / W,
		opacity: 1,
		points: [0.5, 0.5, 0.5],
		rings: [[0.1, 0.2, 0.3, 0.4]],
	};
	const bounds = boundsOfSnapshots([snapshotStroke(stroke)]);
	close(bounds.x0, 0.1);
	close(bounds.y0, 0.2);
	close(bounds.x1, 0.5);
	close(bounds.y1, 0.5);
});
