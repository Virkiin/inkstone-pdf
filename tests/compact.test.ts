import test from "node:test";
import assert from "node:assert/strict";
import {
	COORDINATE_DECIMALS,
	compactDocForSave,
	countPoints,
	roundCoordinates,
	thinPolyline,
} from "../src/compact";
import { createDoc } from "../src/doc";

const PX = 1 / 816; // one CSS pixel on the reference page

function line(count: number, step = PX): number[] {
	const points: number[] = [];
	for (let i = 0; i < count; i++) points.push(0.1 + i * step, 0.2, 0.5);
	return points;
}

test("roundCoordinates keeps 4 decimals and leaves short values alone", () => {
	const points = [0.123456789, 0.5, 0.9999999];
	roundCoordinates(points);
	assert.equal(COORDINATE_DECIMALS, 4);
	assert.deepEqual(points, [0.1235, 0.5, 1]);
});

test("thinPolyline drops vertices closer than 4 px but keeps both ends", () => {
	const dense = line(40); // 1 px apart
	const thin = thinPolyline(dense);
	const count = (values: number[]) => Math.floor(values.length / 3);
	assert.ok(count(thin) < count(dense));
	assert.deepEqual(thin.slice(0, 3), dense.slice(0, 3));
	assert.deepEqual(thin.slice(-3), dense.slice(-3));
	// The final vertex is always kept, so it may sit closer than the gap.
	for (let i = 3; i < thin.length - 3; i += 3) {
		const dx = thin[i] - thin[i - 3];
		assert.ok(Math.abs(dx) >= 4 * PX - 1e-9, `gap ${Math.abs(dx)} too small`);
	}
});

test("thinPolyline leaves two-point polylines untouched", () => {
	const short = [0.1, 0.1, 0.5, 0.11, 0.1, 0.5];
	assert.deepEqual(thinPolyline(short), short);
});

test("compactDocForSave only thins eraser polylines", () => {
	const doc = createDoc("a.pdf");
	const layer = doc.layers[0];
	layer.strokes.push({
		id: "pen",
		kind: "pen",
		page: 1,
		color: "#000",
		width: 0.003,
		opacity: 1,
		points: line(40),
	});
	layer.strokes.push({
		id: "eraser",
		kind: "eraser",
		page: 1,
		color: "#000",
		width: 0.02,
		opacity: 1,
		points: line(40),
	});
	layer.strokes.push({
		id: "lasso",
		kind: "eraser-lasso",
		page: 1,
		color: "#000",
		width: 0.02,
		opacity: 1,
		points: line(40),
	});
	const before = countPoints(doc);
	compactDocForSave(doc);
	const [pen, eraser, lasso] = layer.strokes;
	assert.equal(pen.points.length, 120);
	assert.ok(eraser.points.length < 120);
	assert.equal(lasso.points.length, 120);
	assert.ok(countPoints(doc) < before);
});

test("compactDocForSave never collapses shape control points", () => {
	const doc = createDoc("a.pdf");
	doc.layers[0].strokes.push({
		id: "rect",
		kind: "rect",
		page: 1,
		color: "#000",
		width: 0.003,
		opacity: 1,
		points: [0.10004, 0.20004, 0.5, 0.10006, 0.20006, 0.5],
	});
	compactDocForSave(doc);
	assert.equal(doc.layers[0].strokes[0].points.length, 6);
});

test("compaction is idempotent", () => {
	const doc = createDoc("a.pdf");
	doc.layers[0].strokes.push({
		id: "eraser",
		kind: "eraser",
		page: 1,
		color: "#000",
		width: 0.02,
		opacity: 1,
		points: line(60),
	});
	compactDocForSave(doc);
	const once = [...doc.layers[0].strokes[0].points];
	compactDocForSave(doc);
	assert.deepEqual(doc.layers[0].strokes[0].points, once);
});
