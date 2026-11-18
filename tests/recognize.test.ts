import test from "node:test";
import assert from "node:assert/strict";
import { recognizeStroke, simplify } from "../src/recognize";

const W = 800;
const H = 1000;

/** Build normalized triples from pixel points. */
function path(points: Array<[number, number]>): number[] {
	const out: number[] = [];
	for (const [x, y] of points) out.push(x / W, y / H, 0.5);
	return out;
}

function linePoints(count = 30, wobble = 0): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	for (let i = 0; i < count; i++) {
		const t = i / (count - 1);
		out.push([100 + t * 400, 200 + t * 100 + (i % 2 === 0 ? wobble : -wobble)]);
	}
	return out;
}

function circlePoints(count = 48, rx = 120, ry = 120): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	for (let i = 0; i < count; i++) {
		const a = (i / count) * Math.PI * 2;
		out.push([400 + Math.cos(a) * rx, 500 + Math.sin(a) * ry]);
	}
	out.push(out[0]);
	return out;
}

function rectPoints(count = 8): Array<[number, number]> {
	const corners: Array<[number, number]> = [
		[200, 300],
		[500, 300],
		[500, 550],
		[200, 550],
	];
	const out: Array<[number, number]> = [];
	for (let i = 0; i < corners.length; i++) {
		const [ax, ay] = corners[i];
		const [bx, by] = corners[(i + 1) % corners.length];
		for (let s = 0; s < count; s++) {
			const t = s / count;
			out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
		}
	}
	out.push(corners[0]);
	return out;
}

function jitter(scale: number, seed = 7): (p: [number, number]) => [number, number] {
	let state = seed;
	const rand = (): number => {
		state = (state * 1103515245 + 12345) & 0x7fffffff;
		return state / 0x7fffffff - 0.5;
	};
	return ([x, y]) => [x + rand() * scale, y + rand() * scale];
}

/** A square with rounded corners — the shape that used to come out as an oval. */
function roundedRectPoints(r = 45, perEdge = 10, perArc = 6): Array<[number, number]> {
	// Clockwise: corner centre, arc start angle, arc end angle (screen y down).
	const corners: Array<[number, number, number, number]> = [
		[200, 300, Math.PI / 2, 0], // top-left
		[500, 300, Math.PI, Math.PI / 2], // top-right
		[500, 550, Math.PI * 1.5, Math.PI], // bottom-right
		[200, 550, 0, -Math.PI / 2], // bottom-left
	];
	const at = (cx: number, cy: number, a: number): [number, number] => [
		cx + Math.cos(a) * r,
		cy + Math.sin(a) * r,
	];
	const out: Array<[number, number]> = [];
	for (let i = 0; i < corners.length; i++) {
		const [cx, cy, a0, a1] = corners[i];
		for (let s = 0; s <= perArc; s++) {
			out.push(at(cx, cy, a0 + (a1 - a0) * (s / perArc)));
		}
		const next = corners[(i + 1) % corners.length];
		const from = at(cx, cy, a1);
		const to = at(next[0], next[1], next[2]);
		for (let s = 1; s < perEdge; s++) {
			const t = s / perEdge;
			out.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
		}
	}
	out.push(out[0]);
	return out;
}

test("recognizes a clean line", () => {
	const result = recognizeStroke(path(linePoints(30, 0.4)), W, H);
	assert.ok(result);
	assert.equal(result!.kind, "line");
	assert.equal(result!.points.length, 6);
});

test("rejects a squiggle that is not a shape", () => {
	const squiggle: Array<[number, number]> = [];
	for (let i = 0; i < 40; i++) {
		const t = i / 39;
		squiggle.push([100 + t * 300, 500 + Math.sin(t * Math.PI * 5) * 90]);
	}
	assert.equal(recognizeStroke(path(squiggle), W, H), null);
});

test("recognizes a closed circle as an ellipse", () => {
	const result = recognizeStroke(path(circlePoints(48)), W, H);
	assert.ok(result);
	assert.equal(result!.kind, "ellipse");
	// bbox corners inside the page
	for (let i = 0; i < result!.points.length; i += 3) {
		assert.ok(result!.points[i] > 0 && result!.points[i] < 1);
		assert.ok(result!.points[i + 1] > 0 && result!.points[i + 1] < 1);
	}
});

test("recognizes an axis-aligned box as a rect", () => {
	const result = recognizeStroke(path(rectPoints()), W, H);
	assert.ok(result);
	assert.equal(result!.kind, "rect");
});

test("keeps a rounded-corner square a rect", () => {
	const result = recognizeStroke(path(roundedRectPoints()), W, H);
	assert.ok(result);
	assert.equal(result!.kind, "rect");
});

test("keeps a hand-drawn wobbly square a rect", () => {
	const noisy = rectPoints(6).map(jitter(5));
	const result = recognizeStroke(path(noisy), W, H);
	assert.ok(result);
	assert.equal(result!.kind, "rect");
});

test("keeps a wide oval an ellipse, not a rect", () => {
	const result = recognizeStroke(path(circlePoints(48, 160, 90)), W, H);
	assert.ok(result);
	assert.equal(result!.kind, "ellipse");
});

test("recognizes a triangle drawn as a loop as a polygon", () => {
	const triangle: Array<[number, number]> = [
		[300, 200],
		[500, 500],
		[200, 520],
		[300, 200],
	];
	const dense: Array<[number, number]> = [];
	for (let i = 0; i < triangle.length - 1; i++) {
		const [ax, ay] = triangle[i];
		const [bx, by] = triangle[i + 1];
		for (let s = 0; s < 12; s++) {
			const t = s / 12;
			dense.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
		}
	}
	dense.push(triangle[0]);
	const result = recognizeStroke(path(dense), W, H);
	assert.ok(result);
	assert.equal(result!.kind, "polygon");
	assert.ok(Math.floor(result!.points.length / 3) >= 3);
});

test("ignores very short strokes", () => {
	const tiny: Array<[number, number]> = [
		[100, 100],
		[104, 102],
		[108, 101],
	];
	assert.equal(recognizeStroke(path(tiny), W, H), null);
});

test("simplify keeps the ends and drops collinear points", () => {
	const straight = [
		{ x: 0, y: 0 },
		{ x: 5, y: 0 },
		{ x: 10, y: 0 },
		{ x: 15, y: 0.2 },
	];
	const out = simplify(straight, 1);
	assert.deepEqual(out[0], { x: 0, y: 0 });
	assert.deepEqual(out[out.length - 1], { x: 15, y: 0.2 });
	assert.equal(out.length, 2);

	const corner = [
		{ x: 0, y: 0 },
		{ x: 10, y: 10 },
		{ x: 20, y: 0 },
	];
	assert.equal(simplify(corner, 1).length, 3);
});
