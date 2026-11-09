import test from "node:test";
import assert from "node:assert/strict";
import { strokeHitTest } from "../src/hittest";
import type { Stroke } from "../src/types";

const W = 800;
const H = 1000;

function make(kind: Stroke["kind"], points: number[], width = 0.003): Stroke {
	return { id: "s", kind, page: 1, color: "#000", width, opacity: 1, points };
}

test("hits a freehand stroke along its path", () => {
	const stroke = make("pen", [0.1, 0.1, 0.5, 0.5, 0.1, 0.5, 0.5, 0.5, 0.5]);
	assert.equal(strokeHitTest(stroke, 0.3, 0.1, W, H), true);
	assert.equal(strokeHitTest(stroke, 0.3, 0.4, W, H), false);
});

test("hits the outline of a rect but not its hollow middle", () => {
	const stroke = make("rect", [0.2, 0.2, 0.5, 0.6, 0.6, 0.5]);
	assert.equal(strokeHitTest(stroke, 0.4, 0.2, W, H), true);
	assert.equal(strokeHitTest(stroke, 0.4, 0.4, W, H), false);
});

test("hits the ring of an ellipse", () => {
	const stroke = make("ellipse", [0.2, 0.2, 0.5, 0.6, 0.6, 0.5]);
	assert.equal(strokeHitTest(stroke, 0.4, 0.2, W, H), true);
	assert.equal(strokeHitTest(stroke, 0.4, 0.4, W, H), false);
});

test("hits the edges of a polygon", () => {
	const stroke = make("polygon", [0.2, 0.2, 0.5, 0.5, 0.2, 0.5, 0.35, 0.5, 0.5]);
	assert.equal(strokeHitTest(stroke, 0.35, 0.2, W, H), true);
	assert.equal(strokeHitTest(stroke, 0.35, 0.35, W, H), false);
});

test("never hits eraser strokes", () => {
	const stroke = make("eraser", [0.1, 0.1, 0.5, 0.5, 0.5, 0.5]);
	assert.equal(strokeHitTest(stroke, 0.3, 0.3, W, H), false);
});

test("tolerance grows the hit area", () => {
	const stroke = make("line", [0.1, 0.1, 0.5, 0.5, 0.1, 0.5]);
	assert.equal(strokeHitTest(stroke, 0.3, 0.12, W, H, { tolerancePx: 1 }), false);
	assert.equal(strokeHitTest(stroke, 0.3, 0.12, W, H, { tolerancePx: 30 }), true);
});
