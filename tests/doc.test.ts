import test from "node:test";
import assert from "node:assert/strict";
import { createDoc, findLayer, normalizeDoc } from "../src/doc";

test("createDoc always has one active layer", () => {
	const doc = createDoc("a.pdf");
	assert.equal(doc.layers.length, 1);
	assert.equal(doc.layers[0].visible, true);
	assert.equal(doc.activeLayerId, doc.layers[0].id);
	assert.equal(doc.version, 1);
});

test("normalizeDoc keeps valid data", () => {
	const doc = createDoc("a.pdf");
	doc.layers[0].strokes.push({
		id: "s1",
		kind: "highlighter",
		page: 2,
		color: "#ff0",
		width: 0.004,
		opacity: 0.4,
		points: [0.1, 0.2, 0.5, 0.3, 0.4, 0.6],
	});
	const round = normalizeDoc(JSON.parse(JSON.stringify(doc)), "a.pdf");
	assert.equal(round.layers.length, 1);
	assert.equal(round.layers[0].strokes.length, 1);
	assert.equal(round.layers[0].strokes[0].page, 2);
	assert.equal(round.layers[0].strokes[0].kind, "highlighter");
	assert.deepEqual(round.layers[0].strokes[0].points, [0.1, 0.2, 0.5, 0.3, 0.4, 0.6]);
});

test("normalizeDoc drops malformed strokes but keeps the rest", () => {
	const raw = {
		version: 1,
		file: "a.pdf",
		activeLayerId: "l1",
		layers: [
			{
				id: "l1",
				name: "Layer",
				visible: true,
				locked: false,
				opacity: 1,
				strokes: [
					{ id: "ok", kind: "pen", page: 1, color: "#000", width: 0.002, opacity: 1, points: [0.1, 0.1, 0.5, 0.2, 0.2, 0.5] },
					{ id: "no-points", points: [] },
					{ id: "bad-points", points: [0.1, "x", 0.5] },
					{ id: "partial", points: [0.1, 0.1, 0.5, 0.2] },
					{ id: "shape-too-small", kind: "rect", points: [0.1, 0.1, 0.5] },
				],
			},
		],
	};
	const doc = normalizeDoc(raw, "a.pdf");
	assert.equal(doc.layers.length, 1);
	assert.equal(doc.layers[0].strokes.length, 1);
	assert.equal(doc.layers[0].strokes[0].id, "ok");
});

test("normalizeDoc repairs missing ids, pages and active layer", () => {
	const doc = normalizeDoc(
		{
			layers: [{ strokes: [{ points: [0, 0, 0.5, 1, 1, 0.5] }] }],
			activeLayerId: "does-not-exist",
		},
		"broken.pdf",
	);
	assert.equal(doc.layers.length, 1);
	assert.ok(doc.layers[0].id.length > 0);
	assert.equal(doc.layers[0].name, "图层 1");
	assert.equal(doc.activeLayerId, doc.layers[0].id);
	assert.equal(doc.layers[0].strokes[0].page, 1);
	assert.equal(doc.layers[0].strokes[0].kind, "pen");
});

test("normalizeDoc reads prototype files that stored `tool` instead of `kind`", () => {
	const doc = normalizeDoc(
		{
			layers: [
				{
					strokes: [
						{ tool: "highlighter", points: [0, 0, 0.5, 1, 1, 0.5] },
					],
				},
			],
		},
		"legacy.pdf",
	);
	assert.equal(doc.layers[0].strokes[0].kind, "highlighter");
});

test("normalizeDoc keeps shape strokes with exactly two points", () => {
	const doc = normalizeDoc(
		{
			layers: [
				{
					strokes: [
						{
							kind: "arrow",
							points: [0.1, 0.1, 0.5, 0.2, 0.2, 0.5, 0.3, 0.3, 0.5],
						},
					],
				},
			],
		},
		"shape.pdf",
	);
	assert.equal(doc.layers[0].strokes.length, 1);
	assert.equal(doc.layers[0].strokes[0].points.length, 6);
});

test("normalizeDoc survives garbage input", () => {
	for (const garbage of [null, 42, "nope", {}, []]) {
		const doc = normalizeDoc(garbage, "x.pdf");
		assert.equal(doc.layers.length, 1);
		assert.ok(findLayer(doc, doc.activeLayerId));
	}
});

test("normalizeDoc keeps polygon vertices instead of truncating to two points", () => {
	const doc = normalizeDoc(
		{
			version: 1,
			layers: [
				{
					id: "l1",
					strokes: [
						{
							id: "p1",
							kind: "polygon",
							page: 1,
							points: [0.1, 0.1, 0.5, 0.4, 0.1, 0.5, 0.25, 0.5, 0.5],
						},
						{
							id: "r1",
							kind: "rect",
							page: 1,
							points: [0.1, 0.1, 0.5, 0.4, 0.1, 0.5, 0.25, 0.5, 0.5],
						},
					],
				},
			],
		},
		"a.pdf",
	);
	const [polygon, rect] = doc.layers[0].strokes;
	assert.equal(polygon.points.length, 9);
	assert.equal(rect.points.length, 6);
});

test("normalizeDoc drops polygons with fewer than three vertices", () => {
	const doc = normalizeDoc(
		{ layers: [{ id: "l1", strokes: [{ kind: "polygon", points: [0.1, 0.1, 0.5, 0.2, 0.2, 0.5] }] }] },
		"a.pdf",
	);
	assert.equal(doc.layers[0].strokes.length, 0);
});
