import type { Stroke } from "./types";
import { subtractEraser } from "./outline";
import { flattenStroke, regionHitsPath, type RegionTest } from "./paths";

export * from "./paths";

export type EraserGeometry =
	| {
			kind: "swath";
			points: Array<[number, number]>;
			radius: number;
			/** optional per-point radius (pressure erasing) */
			radii?: number[];
	  }
	| { kind: "rect"; x0: number; y0: number; x1: number; y1: number }
	| { kind: "polygon"; points: Array<[number, number]> };

export function rectRegion(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
): RegionTest {
	const left = Math.min(x0, x1);
	const right = Math.max(x0, x1);
	const top = Math.min(y0, y1);
	const bottom = Math.max(y0, y1);
	return (x, y) => x >= left && x <= right && y >= top && y <= bottom;
}

export function polygonRegion(points: Array<[number, number]>): RegionTest {
	if (points.length < 3) return () => false;
	return (x, y) => {
		let inside = false;
		for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
			const [xi, yi] = points[i];
			const [xj, yj] = points[j];
			if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
				inside = !inside;
			}
		}
		return inside;
	};
}

/** Round swath traced by the freehand eraser. */
export function swathRegion(points: Array<[number, number]>, radius: number): RegionTest {
	if (points.length === 0) return () => false;
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const [x, y] of points) {
		if (x < minX) minX = x;
		if (x > maxX) maxX = x;
		if (y < minY) minY = y;
		if (y > maxY) maxY = y;
	}
	const r2 = radius * radius;
	return (x, y) => {
		if (x < minX - radius || x > maxX + radius || y < minY - radius || y > maxY + radius) {
			return false;
		}
		if (points.length === 1) {
			return (x - points[0][0]) ** 2 + (y - points[0][1]) ** 2 <= r2;
		}
		for (let i = 0; i < points.length - 1; i++) {
			if (segmentDistanceSq(x, y, points[i], points[i + 1]) <= r2) return true;
		}
		return false;
	};
}

function segmentDistanceSq(x: number, y: number, a: [number, number], b: [number, number]): number {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const lengthSq = dx * dx + dy * dy;
	if (lengthSq < 1e-9) return (x - a[0]) ** 2 + (y - a[1]) ** 2;
	let t = ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSq;
	t = Math.max(0, Math.min(1, t));
	return (x - (a[0] + t * dx)) ** 2 + (y - (a[1] + t * dy)) ** 2;
}

/**
 * Renders a stroke as one or more polylines in page pixels. Shapes are
 * sampled so they can be split and hit-tested like handwriting; arrows yield
 * two paths (shaft + head) so the head survives partial erasing.
 */
export function isEraserKind(kind: Stroke["kind"]): boolean {
	return kind === "eraser" || kind === "eraser-rect" || kind === "eraser-lasso";
}

/** Region covered by a stored eraser stroke. */
export function eraserRegionTest(geometry: EraserGeometry): RegionTest {
	if (geometry.kind === "rect") return rectRegion(geometry.x0, geometry.y0, geometry.x1, geometry.y1);
	if (geometry.kind === "polygon") return polygonRegion(geometry.points);
	return (x, y) => {
		const r2 = geometry.radius * geometry.radius;
		for (let i = 0; i < geometry.points.length; i++) {
			const a = geometry.points[i];
			const b = geometry.points[i + 1] ?? geometry.points[i];
			const dx = b[0] - a[0];
			const dy = b[1] - a[1];
			const lengthSq = dx * dx + dy * dy;
			let t = lengthSq < 1e-9 ? 0 : ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSq;
			t = Math.max(0, Math.min(1, t));
			const px = a[0] + t * dx;
			const py = a[1] + t * dy;
			if ((x - px) ** 2 + (y - py) ** 2 <= r2) return true;
		}
		return false;
	};
}

export function eraserBoundsPx(geometry: EraserGeometry): {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
} {
	if (geometry.kind === "rect") {
		return {
			minX: Math.min(geometry.x0, geometry.x1),
			maxX: Math.max(geometry.x0, geometry.x1),
			minY: Math.min(geometry.y0, geometry.y1),
			maxY: Math.max(geometry.y0, geometry.y1),
		};
	}
	const pad = geometry.kind === "swath" ? geometry.radius : 0;
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const [x, y] of geometry.points) {
		if (x < minX) minX = x;
		if (x > maxX) maxX = x;
		if (y < minY) minY = y;
		if (y > maxY) maxY = y;
	}
	return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
}

function strokeBoundsPx(
	stroke: Stroke,
	pageW: number,
	pageH: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	const visit = (x: number, y: number): void => {
		if (x < minX) minX = x;
		if (x > maxX) maxX = x;
		if (y < minY) minY = y;
		if (y > maxY) maxY = y;
	};
	if (stroke.rings && stroke.rings.length > 0) {
		for (const ring of stroke.rings) {
			for (let i = 0; i + 1 < ring.length; i += 2) visit(ring[i] * pageW, ring[i + 1] * pageH);
		}
	} else {
		for (let i = 0; i + 1 < stroke.points.length; i += 3) {
			visit(stroke.points[i] * pageW, stroke.points[i + 1] * pageH);
		}
	}
	const pad = (stroke.width * pageW) / 2;
	return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
}

function boxesOverlap(
	a: { minX: number; minY: number; maxX: number; maxY: number },
	b: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
	return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

/**
 * Erases with an area either by cutting the ink geometry ("涂抹": boolean
 * subtraction, holes survive) or by removing whole strokes that it touches.
 */
export function eraseInk(
	strokes: Stroke[],
	page: number,
	eraser: EraserGeometry,
	scope: "partial" | "whole",
	pageW: number,
	pageH: number,
	nextId: () => string,
): number {
	const bounds = eraserBoundsPx(eraser);
	const region = eraserRegionTest(eraser);
	let changed = 0;
	for (let i = strokes.length - 1; i >= 0; i--) {
		const stroke = strokes[i];
		if (stroke.page !== page) continue;
		if (isEraserKind(stroke.kind)) continue;
		if (!boxesOverlap(strokeBoundsPx(stroke, pageW, pageH), bounds)) continue;

		if (scope === "whole") {
			const paths = flattenStroke(stroke, pageW, pageH);
			if (!paths.some((path) => regionHitsPath(path.points, region))) continue;
			strokes.splice(i, 1);
			changed++;
			continue;
		}

		const pieces = subtractEraser(stroke, eraser, pageW, pageH);
		if (pieces === null) continue;
		if (pieces.length === 0) {
			strokes.splice(i, 1);
			changed++;
			continue;
		}
		const replacement = pieces.map((piece) => ({
			id: nextId(),
			kind: stroke.kind === "highlighter" ? ("highlighter" as const) : ("pen" as const),
			page: stroke.page,
			color: stroke.color,
			width: stroke.width,
			opacity: stroke.opacity,
			points: [] as number[],
			rings: piece.rings,
			fill: true,
		}));
		strokes.splice(i, 1, ...replacement);
		changed++;
	}
	return changed;
}
