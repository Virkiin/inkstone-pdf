/**
 * Tiny performance probe used to locate handwriting latency.
 *
 * Every call is a pair of `performance.now()` reads plus a ring-buffer push,
 * so it stays usable on the hot path (pointermove / rAF). Samples are kept in
 * memory and surfaced through the diagnostics export, never on disk otherwise.
 */

const MAX_SAMPLES = 600;

export interface PerfStat {
	count: number;
	last: number;
	avg: number;
	p50: number;
	p95: number;
	max: number;
	/** sum of every sample (seconds of blocking, for `longtask`) */
	total: number;
}

export interface PerfEvent {
	t: number;
	name: string;
	dur?: number;
}

export interface PerfSnapshot {
	enabled: boolean;
	stats: Record<string, PerfStat>;
	counters: Record<string, number>;
	/** recent long tasks + plugin operations, for correlating hitching */
	timeline: PerfEvent[];
}

export class PerfProbe {
	enabled = true;

	private readonly samples = new Map<string, number[]>();
	private readonly counters = new Map<string, number>();
	private readonly timeline: PerfEvent[] = [];
	private origin = 0;

	now(): number {
		if (typeof performance !== "undefined" && typeof performance.now === "function") {
			return performance.now();
		}
		return Date.now();
	}

	/**
	 * Marks a point on the timeline (used to correlate long tasks).
	 * `at` accepts a `performance.now()` timestamp (e.g. `entry.startTime`),
	 * which places the event where it really happened instead of where it was
	 * delivered — the longtask observer delivers entries in batches.
	 */
	mark(name: string, dur?: number, at?: number): void {
		if (!this.enabled) return;
		const time = at ?? this.now();
		if (this.origin === 0) this.origin = time;
		this.timeline.push({ t: Math.round(time - this.origin), name, dur });
		if (this.timeline.length > 240) this.timeline.splice(0, this.timeline.length - 240);
	}

	/** Record one millisecond sample. */
	add(name: string, ms: number): void {
		if (!this.enabled || !Number.isFinite(ms)) return;
		let list = this.samples.get(name);
		if (!list) {
			list = [];
			this.samples.set(name, list);
		}
		list.push(ms);
		if (list.length > MAX_SAMPLES) list.splice(0, list.length - MAX_SAMPLES);
	}

	/** Record an integer counter (points drawn, bytes written, ...). */
	count(name: string, delta = 1): void {
		if (!this.enabled || !Number.isFinite(delta)) return;
		this.counters.set(name, (this.counters.get(name) ?? 0) + delta);
	}

	/**
	 * Start a timer. Calling the returned function records the elapsed time
	 * and returns it, which keeps call sites a one-liner.
	 */
	start(name: string): () => number {
		if (!this.enabled) return () => 0;
		const t0 = this.now();
		return () => {
			const elapsed = this.now() - t0;
			this.add(name, elapsed);
			return elapsed;
		};
	}

	/** Time a synchronous block. */
	time<T>(name: string, fn: () => T): T {
		if (!this.enabled) return fn();
		const done = this.start(name);
		try {
			return fn();
		} finally {
			done();
		}
	}

	snapshot(): PerfSnapshot {
		const stats: Record<string, PerfStat> = {};
		for (const [name, list] of this.samples) {
			if (list.length === 0) continue;
			const sorted = [...list].sort((a, b) => a - b);
			let total = 0;
			for (const value of list) total += value;
			stats[name] = {
				count: list.length,
				last: round(list[list.length - 1]),
				avg: round(total / list.length),
				p50: round(percentile(sorted, 0.5)),
				p95: round(percentile(sorted, 0.95)),
				max: round(sorted[sorted.length - 1]),
				total: round(total),
			};
		}
		return {
			enabled: this.enabled,
			stats,
			counters: Object.fromEntries(this.counters),
			timeline: [...this.timeline],
		};
	}

	/** Human readable one-line-per-metric summary for a Notice. */
	summary(limit = 8): string[] {
		const snapshot = this.snapshot();
		const rows = Object.entries(snapshot.stats)
			.sort((a, b) => b[1].count - a[1].count)
			.slice(0, limit)
			.map(([name, stat]) => {
				const total = name === "longtask" ? ` total=${(stat.total / 1000).toFixed(1)}s` : "";
				return `${name}: n=${stat.count} avg=${stat.avg}ms p95=${stat.p95}ms max=${stat.max}ms${total}`;
			});
		const counters = Object.entries(snapshot.counters).map(
			([name, value]) => `${name}=${Math.round(value)}`,
		);
		return [...rows, ...(counters.length > 0 ? [counters.join(" ")] : [])];
	}

	reset(): void {
		this.samples.clear();
		this.counters.clear();
		this.timeline.length = 0;
		this.origin = 0;
	}
}

function percentile(sorted: number[], ratio: number): number {
	if (sorted.length === 0) return 0;
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1));
	return sorted[index];
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

export const perf = new PerfProbe();
