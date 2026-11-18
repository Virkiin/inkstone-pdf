import test from "node:test";
import assert from "node:assert/strict";
import { OneEuroFilter, JITTER_PRESETS, createJitterFilter } from "../src/smoothing";

/** Feeds a whole path at a fixed sample rate and returns the filtered points. */
function run(
	filter: OneEuroFilter,
	points: Array<[number, number]>,
	hz = 120,
): Array<[number, number]> {
	return points.map(([x, y], index) => filter.filter(x, y, index / hz));
}

test("smoothing: off means no filter at all", () => {
	assert.equal(createJitterFilter("off"), null);
	assert.ok(createJitterFilter("light") instanceof OneEuroFilter);
	assert.ok(createJitterFilter("medium") instanceof OneEuroFilter);
});

test("smoothing: the first sample is returned untouched", () => {
	const filter = createJitterFilter("medium")!;
	assert.deepEqual(filter.filter(12.5, -3.25, 0), [12.5, -3.25]);
});

test("smoothing: resting tremor is damped", () => {
	const filter = createJitterFilter("light")!;
	// A pen resting on paper: ±4 px wobble at 120 Hz, drifting slowly right.
	const input: Array<[number, number]> = [];
	for (let i = 0; i < 240; i++) {
		input.push([100 + i * 0.5, 200 + (i % 2 === 0 ? 4 : -4)]);
	}
	const output = run(filter, input);
	const tail = output.slice(120);
	const height = Math.max(...tail.map(([, y]) => y)) - Math.min(...tail.map(([, y]) => y));
	assert.ok(height < 8, `tremor should shrink, got ${height.toFixed(2)} px peak to peak`);
});

test("smoothing: fast strokes are still tracked closely", () => {
	const filter = createJitterFilter("light")!;
	// 1200 px/s to the right: the filter must not trail by more than ~40 px.
	const input: Array<[number, number]> = [];
	for (let i = 0; i < 60; i++) input.push([i * 10, 100]);
	const output = run(filter, input);
	const last = output[output.length - 1];
	assert.ok(Math.abs(last[0] - input[input.length - 1][0]) < 40, "no visible lag on fast ink");
});

test("smoothing: medium is calmer than light on the same input", () => {
	const zigzag: Array<[number, number]> = [];
	for (let i = 0; i < 120; i++) zigzag.push([50 + (i % 2 === 0 ? 3 : -3), 60 + i * 0.2]);
	const spread = (points: Array<[number, number]>): number => {
		const xs = points.map(([x]) => x);
		return Math.max(...xs) - Math.min(...xs);
	};
	const light = run(createJitterFilter("light")!, zigzag);
	const medium = run(createJitterFilter("medium")!, zigzag);
	assert.ok(
		JITTER_PRESETS.medium.minCutoff < JITTER_PRESETS.light.minCutoff,
		"presets are ordered",
	);
	assert.ok(spread(medium) <= spread(light) + 1e-9, "medium damps at least as much as light");
});

test("smoothing: reset forgets the previous stroke", () => {
	const filter = createJitterFilter("medium")!;
	filter.filter(0, 0, 0);
	filter.filter(500, 500, 0.01);
	filter.reset();
	assert.deepEqual(filter.filter(10, 20, 1000), [10, 20]);
});

test("smoothing: a non-advancing clock cannot produce NaN", () => {
	const filter = createJitterFilter("light")!;
	filter.filter(0, 0, 5);
	const [x, y] = filter.filter(3, 4, 5);
	assert.ok(Number.isFinite(x) && Number.isFinite(y));
});
