import test from "node:test";
import assert from "node:assert/strict";
import {
	hasPressureVariation,
	hitTestStroke,
	renderStroke,
} from "../src/geometry";
import type { Stroke } from "../src/types";

function stroke(overrides: Partial<Stroke> = {}): Stroke {
	return {
		id: "s1",
		kind: "pen",
		page: 1,
		color: "#000000",
		width: 0.002,
		opacity: 1,
		points: [0.1, 0.5, 0.5, 0.9, 0.5, 0.5],
		...overrides,
	};
}

function fakeContext() {
	const calls: string[] = [];
	const composites: string[] = [];
	let composite = "source-over";
	const ctx: any = {
		globalAlpha: 1,
		strokeStyle: "",
		fillStyle: "",
		lineWidth: 0,
		lineCap: "",
		lineJoin: "",
		save() {
			calls.push("save");
		},
		restore() {
			calls.push("restore");
		},
		beginPath() {
			calls.push("beginPath");
		},
		moveTo() {},
		lineTo() {},
		quadraticCurveTo() {},
		arc() {
			calls.push("arc");
		},
		rect() {
			calls.push("rect");
		},
		ellipse() {
			calls.push("ellipse");
		},
		closePath() {},
		fill() {
			calls.push("fill");
		},
		stroke() {
			calls.push("stroke");
		},
		clearRect() {},
		setTransform() {},
	};
	Object.defineProperty(ctx, "globalCompositeOperation", {
		get: () => composite,
		set: (value: string) => {
			composite = value;
			composites.push(value);
		},
	});
	return {
		ctx: ctx as CanvasRenderingContext2D,
		calls,
		composites,
	};
}

test("hitTestStroke hits a point on the line and misses far points", () => {
	const line = stroke();
	assert.equal(hitTestStroke(line, 0.5, 0.5, 800, 1000, 2), true);
	assert.equal(hitTestStroke(line, 0.5, 0.501, 800, 1000, 2), true);
	assert.equal(hitTestStroke(line, 0.5, 0.9, 800, 1000, 2), false);
	assert.equal(hitTestStroke(line, 0.05, 0.5, 800, 1000, 2), false);
});

test("hitTestStroke respects the pixel tolerance", () => {
	const line = stroke();
	assert.equal(hitTestStroke(line, 0.5, 0.515, 800, 1000, 2), false);
	assert.equal(hitTestStroke(line, 0.5, 0.515, 800, 1000, 20), true);
});

test("hitTestStroke supports single point strokes", () => {
	const dot = stroke({ points: [0.25, 0.25, 0.5] });
	assert.equal(hitTestStroke(dot, 0.25, 0.25, 800, 1000, 2), true);
	assert.equal(hitTestStroke(dot, 0.5, 0.5, 800, 1000, 2), false);
});

test("hitTestStroke ignores empty strokes and page size 0", () => {
	assert.equal(hitTestStroke(stroke({ points: [] }), 0.5, 0.5, 800, 1000, 4), false);
	assert.equal(hitTestStroke(stroke(), 0.5, 0.5, 0, 0, 4), false);
});

test("hasPressureVariation only reports real pen pressure changes", () => {
	assert.equal(hasPressureVariation(stroke()), false);
	assert.equal(
		hasPressureVariation(
			stroke({ points: [0.1, 0.5, 0.2, 0.5, 0.5, 0.9, 0.9, 0.5, 0.4] }),
		),
		true,
	);
	assert.equal(
		hasPressureVariation(
			stroke({
				kind: "highlighter",
				points: [0.1, 0.5, 0.2, 0.9, 0.5, 1],
			}),
		),
		false,
	);
});

test("renderStroke strokes a smooth path for constant width strokes", () => {
	const { ctx, calls } = fakeContext();
	renderStroke(ctx, stroke(), 800, 1000);
	assert.ok(calls.includes("beginPath"));
	assert.ok(calls.includes("stroke"));
	assert.equal(calls.includes("arc"), false);
});

test("renderStroke draws a dot for single point strokes", () => {
	const { ctx, calls } = fakeContext();
	renderStroke(ctx, stroke({ points: [0.5, 0.5, 0.5] }), 800, 1000);
	assert.ok(calls.includes("arc"));
	assert.ok(calls.includes("fill"));
});

test("renderStroke uses per segment widths for pressure strokes", () => {
	const { ctx, calls } = fakeContext();
	renderStroke(
		ctx,
		stroke({ points: [0.1, 0.1, 0.1, 0.2, 0.2, 0.9, 0.3, 0.3, 0.2] }),
		800,
		1000,
	);
	assert.equal(calls.filter((call) => call === "stroke").length >= 2, true);
});

test("eraser strokes composite with destination-out", () => {
	const { ctx, composites } = fakeContext();
	renderStroke(
		ctx,
		stroke({ kind: "eraser", width: 0.01, points: [0.1, 0.1, 0.5, 0.5, 0.5, 0.5] }),
		800,
		1000,
	);
	assert.ok(composites.includes("destination-out"));
});

test("shape kinds draw the expected primitives", () => {
	const rect = fakeContext();
	renderStroke(rect.ctx, stroke({ kind: "rect", points: [0.1, 0.1, 0.5, 0.5, 0.5, 0.5] }), 800, 1000);
	assert.ok(rect.calls.includes("rect"));

	const ellipse = fakeContext();
	renderStroke(
		ellipse.ctx,
		stroke({ kind: "ellipse", points: [0.1, 0.1, 0.5, 0.5, 0.5, 0.5] }),
		800,
		1000,
	);
	assert.ok(ellipse.calls.includes("ellipse"));

	const arrow = fakeContext();
	renderStroke(
		arrow.ctx,
		stroke({ kind: "arrow", points: [0.1, 0.1, 0.5, 0.5, 0.5, 0.5] }),
		800,
		1000,
	);
	assert.ok(arrow.calls.includes("stroke"));
	assert.ok(arrow.calls.includes("fill"));

	const line = fakeContext();
	renderStroke(
		line.ctx,
		stroke({ kind: "line", points: [0.1, 0.1, 0.5, 0.5, 0.5, 0.5] }),
		800,
		1000,
	);
	assert.ok(line.calls.includes("stroke"));
	assert.equal(line.calls.includes("fill"), false);
});

test("renderStroke skips invisible tiny strokes", () => {
	const { ctx, calls } = fakeContext();
	renderStroke(
		ctx,
		stroke({ width: 0.0000001, points: [0, 0, 0.5, 1, 1, 0.5] }),
		100,
		100,
	);
	assert.equal(calls.length, 0);
});
