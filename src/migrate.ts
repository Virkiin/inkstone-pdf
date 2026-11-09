import type { InkDoc, Layer, Stroke } from "./types";
import type { EraserGeometry } from "./erase";
import { eraseInk, isEraserKind } from "./erase";

/**
 * Repairs sidecars written before dev.21, when partial erasing stored an
 * eraser mask instead of cutting the ink. The mask stayed behind when the user
 * moved the stroke, which made "erased" parts reappear.
 *
 * Migration is per page (it needs the rendered page size to know the eraser
 * radius), destroys the masks and leaves only the visible pieces.
 */

export interface MigrationResult {
	strokes: Stroke[];
	/** how many eraser masks were consumed */
	masks: number;
}

export function migratePageStrokes(
	doc: InkDoc,
	page: number,
	pageW: number,
	pageH: number,
	nextId: () => string,
): MigrationResult | null {
	if (pageW < 8 || pageH < 8) return null;
	let masks = 0;
	let touched = false;
	for (const layer of doc.layers) {
		const pageStrokes = layer.strokes.filter((stroke) => stroke.page === page);
		if (!pageStrokes.some((stroke) => isEraserKind(stroke.kind))) continue;
		const ink: Stroke[] = [];
		for (const stroke of pageStrokes) {
			if (!isEraserKind(stroke.kind)) {
				ink.push(stroke);
				continue;
			}
			const geometry = eraserGeometryOf(stroke, pageW, pageH);
			masks++;
			if (!geometry) continue;
			eraseInk(ink, page, geometry, "partial", pageW, pageH, nextId);
		}
		layer.strokes = [...layer.strokes.filter((stroke) => stroke.page !== page), ...ink];
		touched = true;
	}
	return touched ? { strokes: [], masks } : null;
}

function eraserGeometryOf(
	stroke: Stroke,
	pageW: number,
	pageH: number,
): EraserGeometry | null {
	if (stroke.kind === "eraser-rect") {
		if (stroke.points.length < 6) return null;
		return {
			kind: "rect",
			x0: stroke.points[0] * pageW,
			y0: stroke.points[1] * pageH,
			x1: stroke.points[3] * pageW,
			y1: stroke.points[4] * pageH,
		};
	}
	if (stroke.kind === "eraser-lasso") {
		const points: Array<[number, number]> = [];
		for (let i = 0; i < stroke.points.length; i += 3) {
			points.push([stroke.points[i] * pageW, stroke.points[i + 1] * pageH]);
		}
		return points.length >= 3 ? { kind: "polygon", points } : null;
	}
	if (stroke.kind === "eraser") {
		const points: Array<[number, number]> = [];
		for (let i = 0; i < stroke.points.length; i += 3) {
			points.push([stroke.points[i] * pageW, stroke.points[i + 1] * pageH]);
		}
		if (points.length === 0) return null;
		return {
			kind: "swath",
			points,
			radius: Math.max(1.5, (stroke.width * pageW) / 2),
		};
	}
	return null;
}

export function layerOf(doc: InkDoc, id: string | null): Layer | null {
	if (!id) return null;
	return doc.layers.find((layer) => layer.id === id) ?? null;
}
