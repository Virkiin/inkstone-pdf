import type { ShapeKind } from "./types";

/**
 * Turns a hand-drawn stroke into a clean shape.
 *
 * The rules stay deliberately conservative: handwriting is made of short,
 * curved, multi-directional strokes, so anything that does not look like a
 * single clean gesture is rejected and the original ink is kept.
 */

export interface RecognizeOptions {
	/** shortest gesture worth recognizing, in css px on the rendered page */
	minLengthPx: number;
	/** max deviation from the chord, as a fraction of its length */
	lineTolerance: number;
	/** start/end distance over path length below which a loop counts as closed */
	closeRatio: number;
	/** simplification tolerance for corner detection, as a fraction of length */
	simplifyRatio: number;
	/** how far an edge may lean away from horizontal/vertical for a rect */
	axisTolerance: number;
	/** mean radial error allowed for an ellipse */
	ellipseTolerance: number;
}

const DEFAULTS: RecognizeOptions = {
	minLengthPx: 18,
	lineTolerance: 0.035,
	closeRatio: 0.25,
	simplifyRatio: 0.035,
	axisTolerance: 0.34,
	ellipseTolerance: 0.14,
};

export interface RecognizedShape {
	kind: ShapeKind;
	/** normalized x/y/pressure triples, ready to replace a stroke's points */
	points: number[];
	/** 0..1, how well the gesture matched the guess */
	confidence: number;
}

type Pt = { x: number; y: number };

export function recognizeStroke(
	points: number[],
	pageWidth: number,
	pageHeight: number,
	options: Partial<RecognizeOptions> = {},
): RecognizedShape | null {
	const opts = { ...DEFAULTS, ...options };
	if (pageWidth <= 0 || pageHeight <= 0) return null;
	const count = Math.floor(points.length / 3);
	if (count < 4) return null;

	const px: Pt[] = [];
	for (let i = 0; i < count; i++) {
		px.push({ x: points[i * 3] * pageWidth, y: points[i * 3 + 1] * pageHeight });
	}

	let length = 0;
	for (let i = 1; i < px.length; i++) {
		length += distance(px[i - 1], px[i]);
	}
	if (length < opts.minLengthPx) return null;

	const first = px[0];
	const last = px[px.length - 1];
	const span = distance(first, last);
	const closed = span <= opts.closeRatio * length;

	// Straight line: the whole path stays close to the chord.
	if (!closed) {
		const deviation = maxDeviation(px, first, last);
		if (deviation <= Math.max(2.5, opts.lineTolerance * Math.max(span, length))) {
			return normalize([first, last], pageWidth, pageHeight, "line", 1);
		}
	}

	if (!closed) {
		// A triangle drawn without closing the loop can still be recovered, but
		// only when the gesture ends almost where it started and has exactly
		// three corners — otherwise every squiggle would become a polygon.
		const simplified = simplify(px, Math.max(3, 0.06 * length));
		if (simplified.length === 3 && span <= 0.2 * length) {
			return normalize(simplified, pageWidth, pageHeight, "polygon", 0.4);
		}
		return null;
	}

	const loop = closedLoopPoints(px);
	if (loop.length < 3) return null;

	const box = bounds(loop);
	const widthPx = box.maxX - box.minX;
	const heightPx = box.maxY - box.minY;
	if (widthPx < 6 || heightPx < 6) return null;

	const ellipseError = meanEllipseError(loop, box);
	if (ellipseError <= opts.ellipseTolerance) {
		return normalize(
			[
				{ x: box.minX, y: box.minY },
				{ x: box.maxX, y: box.maxY },
			],
			pageWidth,
			pageHeight,
			"ellipse",
			clamp01(1 - ellipseError * 3),
		);
	}

	const corners = simplify(loop, Math.max(2.5, opts.simplifyRatio * length));
	const areaRatio = loopFillRatio(loop, box);
	if (
		(corners.length === 4 && isAxisAligned(corners, opts.axisTolerance)) ||
		(corners.length <= 8 && areaRatio >= 0.86)
	) {
		return normalize(
			[
				{ x: box.minX, y: box.minY },
				{ x: box.maxX, y: box.maxY },
			],
			pageWidth,
			pageHeight,
			"rect",
			clamp01(1 - ellipseError),
		);
	}

	if (corners.length >= 3 && corners.length <= 10) {
		return normalize(corners, pageWidth, pageHeight, "polygon", 0.45);
	}

	return null;
}

function normalize(
	vertices: Pt[],
	pageWidth: number,
	pageHeight: number,
	kind: ShapeKind,
	confidence: number,
): RecognizedShape {
	const points: number[] = [];
	for (const vertex of vertices) {
		points.push(vertex.x / pageWidth, vertex.y / pageHeight, 0.5);
	}
	return { kind, points, confidence: clamp01(confidence) };
}

function distance(a: Pt, b: Pt): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function maxDeviation(points: Pt[], start: Pt, end: Pt): number {
	const length = distance(start, end);
	if (length < 1e-6) return Number.POSITIVE_INFINITY;
	let worst = 0;
	for (const point of points) {
		const dev =
			Math.abs((end.x - start.x) * (start.y - point.y) - (start.x - point.x) * (end.y - start.y)) /
			length;
		if (dev > worst) worst = dev;
	}
	return worst;
}

/** Drop the duplicated closing vertex so loops are measured once. */
function closedLoopPoints(points: Pt[]): Pt[] {
	const loop = [...points];
	if (loop.length > 3 && distance(loop[0], loop[loop.length - 1]) < 2) loop.pop();
	return loop;
}

function bounds(points: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const point of points) {
		if (point.x < minX) minX = point.x;
		if (point.x > maxX) maxX = point.x;
		if (point.y < minY) minY = point.y;
		if (point.y > maxY) maxY = point.y;
	}
	return { minX, minY, maxX, maxY };
}

/** Mean |normalized radial distance - 1|, i.e. how far the loop is from an ellipse. */
function meanEllipseError(
	points: Pt[],
	box: { minX: number; minY: number; maxX: number; maxY: number },
): number {
	const cx = (box.minX + box.maxX) / 2;
	const cy = (box.minY + box.maxY) / 2;
	const rx = Math.max(1e-6, (box.maxX - box.minX) / 2);
	const ry = Math.max(1e-6, (box.maxY - box.minY) / 2);
	let total = 0;
	for (const point of points) {
		const value = ((point.x - cx) / rx) ** 2 + ((point.y - cy) / ry) ** 2;
		total += Math.abs(Math.sqrt(value) - 1);
	}
	return total / points.length;
}

/** How much of the bounding box the closed loop actually fills (1 = box). */
function loopFillRatio(
	points: Pt[],
	box: { minX: number; minY: number; maxX: number; maxY: number },
): number {
	const boxArea = (box.maxX - box.minX) * (box.maxY - box.minY);
	if (boxArea <= 1e-6) return 0;
	let area = 0;
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		area += a.x * b.y - b.x * a.y;
	}
	return Math.min(1, Math.abs(area / 2) / boxArea);
}

function isAxisAligned(corners: Pt[], tolerance: number): boolean {
	for (let i = 0; i < corners.length; i++) {
		const a = corners[i];
		const b = corners[(i + 1) % corners.length];
		const dx = Math.abs(b.x - a.x);
		const dy = Math.abs(b.y - a.y);
		const length = Math.hypot(dx, dy);
		if (length < 1e-6) return false;
		if (Math.min(dx, dy) / length > tolerance) return false;
	}
	return true;
}

/** Ramer–Douglas–Peucker: keeps the vertices that matter for corners. */
export function simplify(points: Pt[], epsilon: number): Pt[] {
	if (points.length < 3) return [...points];
	const keep = new Array<boolean>(points.length).fill(false);
	keep[0] = true;
	keep[points.length - 1] = true;
	const stack: Array<[number, number]> = [[0, points.length - 1]];
	while (stack.length > 0) {
		const [start, end] = stack.pop()!;
		let index = -1;
		let max = 0;
		for (let i = start + 1; i < end; i++) {
			const dev = perpendicularDistance(points[i], points[start], points[end]);
			if (dev > max) {
				max = dev;
				index = i;
			}
		}
		if (index >= 0 && max > epsilon) {
			keep[index] = true;
			stack.push([start, index], [index, end]);
		}
	}
	return points.filter((_, i) => keep[i]);
}

function perpendicularDistance(point: Pt, start: Pt, end: Pt): number {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const length = Math.hypot(dx, dy);
	if (length < 1e-6) return distance(point, start);
	return Math.abs(dy * (point.x - start.x) - dx * (point.y - start.y)) / length;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}
