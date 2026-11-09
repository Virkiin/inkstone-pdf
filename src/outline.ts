import {
	ClipType,
	EndType,
	FillRule,
	JoinType,
	PolyTree64,
	booleanOpWithPolyTree,
	inflatePaths,
	isPositive,
	ramerDouglasPeucker,
	reversePath,
	simplifyPaths,
	union,
} from "clipper2-ts";
import type { Path64, Paths64 } from "clipper2-ts";
import type { EraserGeometry } from "./erase";
import { isShapeKind } from "./doc";
import { pressureWidthFactor } from "./geometry";
import { flattenStroke } from "./paths";
import type { Stroke } from "./types";

/**
 * Stroke-to-outline + boolean difference.
 *
 * Vector strokes are centerlines with a width, which cannot represent a hole.
 * Converting the stroke into its filled outline and subtracting the eraser
 * shape gives true geometry: a bite inside a thick stroke becomes an inner
 * contour, a cut through a thin stroke becomes several contours.
 */

/** Integer scale for Clipper (1 unit = 0.01 px). */
export const OUTLINE_SCALE = 100;
/** Keep arc tessellation sub-pixel. */
const ARC_TOLERANCE_PX = 0.4;
/** Drop outline vertices that deviate less than this from the chord. */
const SIMPLIFY_PX = 0.25;

export interface OutlinePiece {
	/** flat normalized [x0, y0, x1, y1, ...] */
	rings: number[][];
}

/** Converts page-pixel points (eraser geometry, flattened paths) to Clipper ints. */
function pxToPath64(points: Array<[number, number]>): Path64 {
	return points.map(([x, y]) => ({
		x: Math.round(x * OUTLINE_SCALE),
		y: Math.round(y * OUTLINE_SCALE),
	}));
}

function ringToPath64(ring: number[], pageW: number, pageH: number): Path64 {
	const out: Path64 = [];
	for (let i = 0; i + 1 < ring.length; i += 2) {
		out.push({
			x: Math.round(ring[i] * pageW * OUTLINE_SCALE),
			y: Math.round(ring[i + 1] * pageH * OUTLINE_SCALE),
		});
	}
	return out;
}

/** The stroke's visible area as polygon paths (outer ring plus holes). */
export function strokeToPaths(stroke: Stroke, pageW: number, pageH: number): Paths64 {
	if (stroke.rings && stroke.rings.length > 0) {
		return stroke.rings
			.map((ring) => ringToPath64(ring, pageW, pageH))
			.filter((path) => path.length >= 3);
	}
	const radius = Math.max(0.4, (stroke.width * pageW) / 2) * OUTLINE_SCALE;
	const shape = isShapeKind(stroke.kind);
	if (shape) {
		const parts = flattenStroke(stroke, pageW, pageH);
		if (parts.length === 0) return [];
		let accumulated: Paths64 = [];
		for (const part of parts) {
			const path = pxToPath64(
				part.points.map((point) => [point.x, point.y] as [number, number]),
			);
			if (path.length === 0) continue;
			// Filled parts (an arrow head, a filled polygon) are already areas:
			// inflating them would round their corners and fatten the shape.
			const outline = part.fill
				? [path]
				: path.length === 1
					? [circlePath(path[0].x, path[0].y, radius)]
					: inflatePaths(
							[path],
							radius,
							JoinType.Round,
							EndType.Round,
							2,
							ARC_TOLERANCE_PX * OUTLINE_SCALE,
						);
			accumulated =
				accumulated.length === 0
					? outline
					: union(
							accumulated,
							outline.map((item) => sameWinding(accumulated[0], item)),
							FillRule.NonZero,
						);
		}
		return accumulated;
	}
	return freehandOutline(stroke, pageW, pageH);
}

/**
 * Freehand outline that keeps the pressure taper: a ribbon whose left and
 * right edges follow the per-point pen width, plus round caps.
 */
function freehandOutline(stroke: Stroke, pageW: number, pageH: number): Paths64 {
	const points = stroke.points;
	const count = Math.floor(points.length / 3);
	if (count === 0) return [];
	const baseWidth = Math.max(1, stroke.width * pageW) * OUTLINE_SCALE;
	const variable = stroke.kind === "pen";
	const px: Array<{ x: number; y: number; w: number }> = [];
	for (let i = 0; i < count; i++) {
		const pressure = points[i * 3 + 2];
		const factor = variable && Number.isFinite(pressure) ? pressureWidthFactor(pressure) : 1;
		px.push({
			x: Math.round(points[i * 3] * pageW * OUTLINE_SCALE),
			y: Math.round(points[i * 3 + 1] * pageH * OUTLINE_SCALE),
			w: baseWidth * factor,
		});
	}
	return ribbonPaths(px);
}

/** Variable-width ribbon with round caps and round joins at sharp turns. */
function ribbonPaths(px: Array<{ x: number; y: number; w: number }>): Paths64 {
	if (px.length === 0) return [];
	if (px.length === 1) return [circlePath(px[0].x, px[0].y, Math.max(1, px[0].w / 2))];
	const left: Path64 = [];
	const right: Path64 = [];
	let lastNormal = { x: 0, y: -1 };
	for (let i = 0; i < px.length; i++) {
		const prev = px[Math.max(0, i - 1)];
		const next = px[Math.min(px.length - 1, i + 1)];
		let tx = next.x - prev.x;
		let ty = next.y - prev.y;
		const length = Math.hypot(tx, ty);
		if (length < 1e-6) {
			tx = lastNormal.x;
			ty = lastNormal.y;
		} else {
			tx /= length;
			ty /= length;
			lastNormal = { x: tx, y: ty };
		}
		const nx = -ty;
		const ny = tx;
		const half = Math.max(1, px[i].w / 2);
		left.push({ x: Math.round(px[i].x + nx * half), y: Math.round(px[i].y + ny * half) });
		right.push({ x: Math.round(px[i].x - nx * half), y: Math.round(px[i].y - ny * half) });
	}
	const ribbon: Path64 = [...left, ...right.reverse()];
	const cleaned = simplifyPaths([ribbon], FillRule.NonZero);
	const round: Paths64 = [
		circlePath(px[0].x, px[0].y, Math.max(1, px[0].w / 2)),
		circlePath(px[px.length - 1].x, px[px.length - 1].y, Math.max(1, px[px.length - 1].w / 2)),
	];
	for (let i = 1; i < px.length - 1; i++) {
		const a = px[i - 1];
		const b = px[i];
		const c = px[i + 1];
		const v1 = Math.atan2(b.y - a.y, b.x - a.x);
		const v2 = Math.atan2(c.y - b.y, c.x - b.x);
		let turn = Math.abs(v2 - v1);
		if (turn > Math.PI) turn = Math.PI * 2 - turn;
		if (turn > 0.44) round.push(circlePath(b.x, b.y, Math.max(1, b.w / 2)));
	}
	const base = cleaned.length > 0 ? cleaned : [ribbon];
	return union(
		base,
		round.map((path) => sameWinding(base[0], path)),
		FillRule.NonZero,
	);
}

export function eraserToPaths(
	geometry: EraserGeometry,
	pageW: number,
	pageH: number,
): Paths64 {
	if (geometry.kind === "rect") {
		const path = pxToPath64([
			[geometry.x0, geometry.y0],
			[geometry.x1, geometry.y0],
			[geometry.x1, geometry.y1],
			[geometry.x0, geometry.y1],
		]);
		return path.length >= 3 ? [path] : [];
	}
	if (geometry.kind === "polygon") {
		const path = pxToPath64(geometry.points);
		return path.length >= 3 ? [path] : [];
	}
	const trail = pxToPath64(geometry.points);
	if (trail.length === 0) return [];
	const radius = Math.max(0.4, geometry.radius) * OUTLINE_SCALE;
	if (trail.length === 1) return [circlePath(trail[0].x, trail[0].y, radius)];
	if (geometry.radii && geometry.radii.length === trail.length) {
		// Pressure erasing: the swath width varies along the trail.
		const px = trail.map((point, index) => ({
			x: point.x,
			y: point.y,
			w: Math.max(2, geometry.radii![index] * 2 * OUTLINE_SCALE),
		}));
		return ribbonPaths(px);
	}
	return inflatePaths(
		[trail],
		radius,
		JoinType.Round,
		EndType.Round,
		2,
		ARC_TOLERANCE_PX * OUTLINE_SCALE,
	);
}

/**
 * Clipper's NonZero union treats opposite windings as holes, so every operand
 * must wind the same way as the shape it is merged into.
 */
function sameWinding(reference: Path64, path: Path64): Path64 {
	if (path.length < 3 || reference.length < 3) return path;
	return isPositive(path) === isPositive(reference) ? path : reversePath(path);
}

function circlePath(cx: number, cy: number, radius: number): Path64 {
	const steps = Math.max(
		12,
		Math.min(96, Math.ceil((Math.PI * 2 * radius) / (ARC_TOLERANCE_PX * OUTLINE_SCALE))),
	);
	const out: Path64 = [];
	for (let i = 0; i < steps; i++) {
		const angle = (i / steps) * Math.PI * 2;
		out.push({
			x: Math.round(cx + Math.cos(angle) * radius),
			y: Math.round(cy + Math.sin(angle) * radius),
		});
	}
	return out;
}

function polygonArea(path: Path64): number {
	let area = 0;
	for (let i = 0; i < path.length; i++) {
		const a = path[i];
		const b = path[(i + 1) % path.length];
		area += a.x * b.y - b.x * a.y;
	}
	return Math.abs(area / 2) / (OUTLINE_SCALE * OUTLINE_SCALE);
}

function toNormalizedRing(path: Path64, pageW: number, pageH: number): number[] {
	const ring: number[] = [];
	for (const point of path) {
		ring.push(
			Number((point.x / OUTLINE_SCALE / pageW).toFixed(4)),
			Number((point.y / OUTLINE_SCALE / pageH).toFixed(4)),
		);
	}
	return ring;
}

/**
 * Subtracts the eraser from the stroke area.
 * Returns null when nothing changed, or the list of resulting pieces
 * (each piece = outer ring + holes).
 */
export function subtractEraser(
	stroke: Stroke,
	eraser: EraserGeometry,
	pageW: number,
	pageH: number,
): OutlinePiece[] | null {
	const subject = strokeToPaths(stroke, pageW, pageH);
	if (subject.length === 0) return null;
	const clip = eraserToPaths(eraser, pageW, pageH);
	if (clip.length === 0) return null;

	const tree = new PolyTree64();
	booleanOpWithPolyTree(ClipType.Difference, subject, clip, tree, FillRule.EvenOdd);

	const pieces: OutlinePiece[] = [];
	const walk = (nodeCount: number, nodeAt: (index: number) => any): void => {
		for (let i = 0; i < nodeCount; i++) {
			const node = nodeAt(i);
			const polygon = node.polygon as Path64 | null;
			if (polygon && polygon.length >= 3 && polygonArea(polygon) >= 0.75) {
				const simplified = ramerDouglasPeucker(polygon, SIMPLIFY_PX * OUTLINE_SCALE);
				const rings: number[][] = [
					toNormalizedRing(simplified.length >= 3 ? simplified : polygon, pageW, pageH),
				];
				const holes = node.count as number;
				for (let h = 0; h < holes; h++) {
					const hole = node.child(h);
					const holePoly = hole.polygon as Path64 | null;
					if (holePoly && holePoly.length >= 3) {
						const simpleHole = ramerDouglasPeucker(
							holePoly,
							SIMPLIFY_PX * OUTLINE_SCALE,
						);
						rings.push(
							toNormalizedRing(
								simpleHole.length >= 3 ? simpleHole : holePoly,
								pageW,
								pageH,
							),
						);
					}
				}
				pieces.push({ rings });
			}
			// Nested islands are holes of holes; skip them to stay conservative.
		}
	};
	walk(tree.count, (index) => tree.child(index));

	if (pieces.length === 0) return [];
	// Unchanged (same single ring, same point count) means the eraser missed.
	if (subject.length === 1 && pieces.length === 1 && pieces[0].rings.length === 1) {
		const before = Math.round(polygonArea(subject[0]) * 100) / 100;
		const after = Math.round(polygonArea(strokeToPathsFromRings(pieces[0].rings, pageW, pageH)) * 100) / 100;
		if (before === after) return null;
	}
	return pieces;
}

function strokeToPathsFromRings(
	rings: number[][],
	pageW: number,
	pageH: number,
): Path64 {
	return ringToPath64(rings[0], pageW, pageH);
}

/** Bounding box of the eraser in page pixels, for a cheap early-out. */
export function eraserBounds(
	geometry: EraserGeometry,
): { minX: number; minY: number; maxX: number; maxY: number } {
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
	return {
		minX: minX - pad,
		maxX: maxX + pad,
		minY: minY - pad,
		maxY: maxY + pad,
	};
}
