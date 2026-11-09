import test from "node:test";
import assert from "node:assert/strict";
import { PerfProbe } from "../src/perf";

test("perf records samples and reports avg/p50/p95/max", () => {
	const probe = new PerfProbe();
	for (const value of [1, 2, 3, 4, 100]) probe.add("render", value);
	const stat = probe.snapshot().stats.render;
	assert.equal(stat.count, 5);
	assert.equal(stat.max, 100);
	assert.equal(stat.last, 100);
	assert.equal(stat.avg, 22);
	// p95 of five sorted samples picks the last element.
	assert.equal(stat.p95, 100);
	assert.equal(stat.p50, 3);
});

test("perf keeps a bounded ring buffer", () => {
	const probe = new PerfProbe();
	for (let i = 0; i < 700; i++) probe.add("live", i);
	const stat = probe.snapshot().stats.live;
	assert.equal(stat.count, 600);
	assert.equal(stat.max, 699);
	assert.equal(stat.last, 699);
	assert.equal(stat.avg, (100 + 699) / 2);
});

test("perf timeline places marks at the provided timestamp", () => {
	const probe = new PerfProbe();
	probe.mark("longtask", 120, 1000);
	probe.mark("commit", undefined, 1250);
	probe.mark("longtask", 90, 900);
	const timeline = probe.snapshot().timeline;
	assert.deepEqual(
		timeline.map((event) => [event.name, event.t]),
		[
			["longtask", 0],
			["commit", 250],
			["longtask", -100],
		],
	);
});

test("perf reports the total alongside avg/p95", () => {
	const probe = new PerfProbe();
	for (const value of [100, 200, 300]) probe.add("longtask", value);
	const stat = probe.snapshot().stats.longtask;
	assert.equal(stat.total, 600);
});

test("perf counters accumulate per name", () => {
	const probe = new PerfProbe();
	probe.count("points.added", 3);
	probe.count("points.added", 2);
	probe.count("save.bytes", 40);
	assert.deepEqual(probe.snapshot().counters, {
		"points.added": 5,
		"save.bytes": 40,
	});
});

test("perf start/time helpers record one sample each", () => {
	const probe = new PerfProbe();
	const done = probe.start("extend");
	done();
	assert.equal(probe.snapshot().stats.extend.count, 1);
	const value = probe.time("commit", () => 42);
	assert.equal(value, 42);
	assert.equal(probe.snapshot().stats.commit.count, 1);
});

test("perf time records the sample even when the block throws", () => {
	const probe = new PerfProbe();
	assert.throws(() =>
		probe.time("boom", () => {
			throw new Error("nope");
		}),
	);
	assert.equal(probe.snapshot().stats.boom.count, 1);
});

test("perf ignores samples and counters while disabled", () => {
	const probe = new PerfProbe();
	probe.enabled = false;
	probe.add("render", 5);
	probe.count("frames");
	const snapshot = probe.snapshot();
	assert.deepEqual(snapshot.stats, {});
	assert.deepEqual(snapshot.counters, {});
	assert.equal(snapshot.enabled, false);
});

test("perf reset clears samples and counters", () => {
	const probe = new PerfProbe();
	probe.add("render", 5);
	probe.count("frames");
	probe.reset();
	const snapshot = probe.snapshot();
	assert.deepEqual(snapshot.stats, {});
	assert.deepEqual(snapshot.counters, {});
});

test("perf summary lists the busiest metrics first", () => {
	const probe = new PerfProbe();
	probe.add("rare", 9);
	probe.add("common", 1);
	probe.add("common", 2);
	const lines = probe.summary(5);
	assert.ok(lines[0].startsWith("common: n=2"), lines[0]);
	assert.ok(lines[1].startsWith("rare: n=1"), lines[1]);
});
