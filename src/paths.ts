import type { Stroke } from "./types";

export interface Px {
	x: number;
	y: number;
	/** pen pressure 0..1, kept so split pieces do not become uniform blobs */
	p: number;
}

export type RegionTest = (x: number, y: number) => boolean;

export interface FlatPath {
	points: Px[];
	/** the path is a closed shape that should be filled, not stroked */
	fill: boolean;
}

export function flattenStroke(
	stroke: Stroke,
	pageWidth: number,
	pageHeight: number,
): FlatPath[] {
	const points = stroke.points;
	const count = Math.floor(points.length / 3);
	const raw: Px[] = [];
	for (let i = 0; i < count; i++) {
		raw.push({
			x: points[i * 3] * pageWidth,
			y: points[i * 3 + 1] * pageHeight,
			p: Number.isFinite(points[i * 3 + 2]) ? points[i * 3 + 2] : 0.5,
		});
	}
	if (raw.length === 0) return [];
	if (raw.length === 1) return [{ points: raw, fill: false }];

	const kind = stroke.kind;
	if (kind === "rect") {
		const [a, b] = raw;
		return [
			{
				points: [
					{ x: a.x, y: a.y, p: 0.5 },
					{ x: b.x, y: a.y, p: 0.5 },
					{ x: b.x, y: b.y, p: 0.5 },
					{ x: a.x, y: b.y, p: 0.5 },
					{ x: a.x, y: a.y, p: 0.5 },
				],
				fill: false,
			},
		];
	}
	if (kind === "ellipse") {
		const [a, b] = raw;
		const cx = (a.x + b.x) / 2;
		const cy = (a.y + b.y) / 2;
		const rx = Math.abs(b.x - a.x) / 2;
		const ry = Math.abs(b.y - a.y) / 2;
		const out: Px[] = [];
		const steps = 64;
		for (let i = 0; i <= steps; i++) {
			const angle = (i / steps) * Math.PI * 2;
			out.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry, p: 0.5 });
		}
		return [{ points: out, fill: false }];
	}
	if (kind === "polygon") {
		return [{ points: [...raw, { ...raw[0] }], fill: stroke.fill === true }];
	}
	if (kind === "arrow") {
		const [a, b] = raw;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const length = Math.hypot(dx, dy);
		if (length < 0.5) return [{ points: [a, b], fill: false }];
		const lineWidth = Math.max(0.5, stroke.width * pageWidth);
		const head = Math.min(Math.max(lineWidth * 6, 10), length * 0.5);
		const ux = dx / length;
		const uy = dy / length;
		const bx = b.x - ux * head;
		const by = b.y - uy * head;
		const half = Math.max(head * 0.55, lineWidth * 1.5);
		const px = -uy;
		const py = ux;
		return [
			{
				points: [
					{ x: a.x, y: a.y, p: 0.5 },
					{ x: bx, y: by, p: 0.5 },
				],
				fill: false,
			},
			{
				points: [
					{ x: b.x, y: b.y, p: 0.5 },
					{ x: bx + px * half, y: by + py * half, p: 0.5 },
					{ x: bx - px * half, y: by - py * half, p: 0.5 },
					{ x: b.x, y: b.y, p: 0.5 },
				],
				fill: true,
			},
		];
	}
	return [{ points: raw, fill: false }];
}

/** Inserts intermediate vertices so a region edge cannot slip between two points. */
export function densify(points: Px[], step = 1.5): Px[] {
	if (points.length < 2) return [...points];
	const out: Px[] = [points[0]];
	for (let i = 0; i < points.length - 1; i++) {
		const a = points[i];
		const b = points[i + 1];
		const length = Math.hypot(b.x - a.x, b.y - a.y);
		const steps = Math.max(1, Math.ceil(length / step));
		for (let s = 1; s <= steps; s++) {
			const t = s / steps;
			out.push({
				x: a.x + (b.x - a.x) * t,
				y: a.y + (b.y - a.y) * t,
				p: a.p + (b.p - a.p) * t,
			});
		}
	}
	return out;
}

/** Does any part of the polyline enter the region, even between two vertices? */
export function regionHitsPath(points: Px[], inside: RegionTest, step = 2): boolean {
	if (points.length === 0) return false;
	if (points.length === 1) return inside(points[0].x, points[0].y);
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		const length = Math.hypot(b.x - a.x, b.y - a.y);
		const steps = Math.max(1, Math.ceil(length / step));
		for (let s = 0; s <= steps; s++) {
			const t = s / steps;
			if (inside(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return true;
		}
	}
	return false;
}

export function regionTouches(points: Px[], inside: RegionTest): boolean {
	for (const point of points) {
		if (inside(point.x, point.y)) return true;
	}
	return false;
}

/**
 * Cuts a polyline at the exact region boundary.
 *
 * Sampling a fixed grid and dropping the points inside leaves a gap that can
 * be up to one sample wider than the eraser. Here the crossing t is found by
 * bisection, so the cut lands on the boundary within `epsilon` pixels.
 */
export function clipRuns(
	points: Px[],
	inside: RegionTest,
	maxSegmentPx = 2,
	epsilon = 0.02,
): Px[][] {
	if (points.length < 2) return points.length === 1 && !inside(points[0].x, points[0].y)
		? [points]
		: [];
	const dense: Px[] = [points[0]];
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		const length = Math.hypot(b.x - a.x, b.y - a.y);
		const steps = Math.max(1, Math.ceil(length / maxSegmentPx));
		for (let s = 1; s <= steps; s++) {
			const t = s / steps;
			dense.push({
				x: a.x + (b.x - a.x) * t,
				y: a.y + (b.y - a.y) * t,
				p: a.p + (b.p - a.p) * t,
			});
		}
	}

	const runs: Px[][] = [];
	let current: Px[] = [];
	let state = inside(dense[0].x, dense[0].y);
	if (!state) current.push(dense[0]);

	for (let i = 1; i < dense.length; i++) {
		const a = dense[i - 1];
		const b = dense[i];
		const next = inside(b.x, b.y);
		if (next === state) {
			if (!next) current.push(b);
			continue;
		}
		const cut = crossing(a, b, state, inside, epsilon);
		if (current.length > 0) {
			current.push(cut);
			if (current.length > 1) runs.push(current);
		}
		current = next ? [] : [cut, b];
		state = next;
	}
	if (current.length > 1) runs.push(current);
	return runs;
}

/** Bisects the segment where `inside` flips state. */
function crossing(
	a: Px,
	b: Px,
	startInside: boolean,
	inside: RegionTest,
	epsilon: number,
): Px {
	let lo = 0;
	let hi = 1;
	const length = Math.hypot(b.x - a.x, b.y - a.y);
	for (let i = 0; i < 24 && (hi - lo) * length > epsilon; i++) {
		const mid = (lo + hi) / 2;
		const insideMid = inside(a.x + (b.x - a.x) * mid, a.y + (b.y - a.y) * mid);
		if (insideMid === startInside) lo = mid;
		else hi = mid;
	}
	const t = (lo + hi) / 2;
	return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: a.p + (b.p - a.p) * t };
}

/** Consecutive runs of points that stay outside the region. */
export function splitByRegion(points: Px[], inside: RegionTest): Px[][] {
	const runs: Px[][] = [];
	let current: Px[] = [];
	for (const point of points) {
		if (inside(point.x, point.y)) {
			if (current.length > 1) runs.push(current);
			current = [];
			continue;
		}
		current.push(point);
	}
	if (current.length > 1) runs.push(current);
	return runs;
}
