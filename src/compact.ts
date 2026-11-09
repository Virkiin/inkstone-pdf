import type { InkDoc, Stroke } from "./types";
import { REFERENCE_PAGE_WIDTH } from "./util";

/**
 * Sidecar compaction.
 *
 * A 749-page PDF annotated over a few sessions reached 2.3 MB of JSON, which
 * cost ~14 ms to stringify and up to ~320 ms to write — every 500 ms after a
 * stroke. Most of that weight is avoidable:
 *
 *  - coordinates were stored as full float64 (`0.12345678901234567`), i.e. far
 *    below a pixel of precision on a 816 px page
 *  - eraser strokes interpolate every 2 px and keep every sample forever, so
 *    they ended up holding ~50% of all points in the file
 *
 * Both knobs are visual no-ops at this scale, so compaction runs on the doc
 * right before it is serialised.
 */

/** 4 decimals ≈ 0.08 px on an 816 px page. */
export const COORDINATE_DECIMALS = 4;
const COORDINATE_SCALE = 10 ** COORDINATE_DECIMALS;

/** Keep eraser polyline vertices at most ~4 px apart. */
export const ERASER_MIN_GAP_PX = 4;
const ERASER_MIN_GAP = ERASER_MIN_GAP_PX / REFERENCE_PAGE_WIDTH;

/** Only polyline erasers are thinned; rect/lasso owners and ink are untouched. */
const THINNABLE_KINDS = new Set(["eraser"]);

export function roundCoordinates(points: number[], scale = COORDINATE_SCALE): void {
	for (let i = 0; i < points.length; i++) {
		const rounded = Math.round(points[i] * scale) / scale;
		if (rounded !== points[i]) points[i] = rounded;
	}
}

/**
 * Drop vertices that are closer than `minGap` to the previously kept one.
 * The first and last vertex are always preserved so the stroke keeps its
 * endpoints (and its eraser swath stays anchored).
 */
export function thinPolyline(points: number[], minGap = ERASER_MIN_GAP): number[] {
	const count = Math.floor(points.length / 3);
	if (count <= 2) return points;
	const gapSq = minGap * minGap;
	const out: number[] = [points[0], points[1], points[2]];
	let lastX = points[0];
	let lastY = points[1];
	for (let i = 1; i < count - 1; i++) {
		const x = points[i * 3];
		const y = points[i * 3 + 1];
		const dx = x - lastX;
		const dy = y - lastY;
		if (dx * dx + dy * dy < gapSq) continue;
		out.push(x, y, points[i * 3 + 2]);
		lastX = x;
		lastY = y;
	}
	const tail = (count - 1) * 3;
	out.push(points[tail], points[tail + 1], points[tail + 2]);
	return out;
}

export function compactStroke(stroke: Stroke): void {
	if (stroke.rings) {
		for (const ring of stroke.rings) roundCoordinates(ring);
	}
	// Shapes carry exactly two control points; rounding never changes their
	// meaning but thinning would collapse the segment.
	roundCoordinates(stroke.points);
	if (!THINNABLE_KINDS.has(stroke.kind)) return;
	if (Math.floor(stroke.points.length / 3) <= 2) return;
	stroke.points = thinPolyline(stroke.points);
}

/**
 * Compacts in place so later saves only pay for the already-shrunken data.
 * Returns the same doc for convenience.
 */
export function compactDocForSave(doc: InkDoc): InkDoc {
	for (const layer of doc.layers) {
		for (const stroke of layer.strokes) compactStroke(stroke);
	}
	return doc;
}

/** Total stored points, used by the perf probe and tests. */
export function countPoints(doc: InkDoc): number {
	let total = 0;
	for (const layer of doc.layers) {
		for (const stroke of layer.strokes) total += Math.floor(stroke.points.length / 3);
	}
	return total;
}
