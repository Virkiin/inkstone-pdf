import type { Stroke, StrokeKind } from "./types";
import { clamp } from "./util";

/**
 * Selection transforms (scale / rotate).
 *
 * Everything is computed in css-pixel space and then written back as
 * normalized coordinates, because the page is not square: a uniform scale in
 * normalized units would squash the ink.
 *
 * Rotation cannot be stored for `rect` / `ellipse` (they render axis aligned
 * from two corners), so a rotated box is baked into an equivalent `polygon`.
 * That keeps the model free of a rotation field while staying pixel exact.
 */

export interface Bounds {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

/** Everything a transform can overwrite, captured before the drag starts. */
export interface StrokeSnapshot {
	id: string;
	kind: StrokeKind;
	points: number[];
	rings: number[][] | null;
	width: number;
}

export interface InkTransform {
	/** horizontal scale, 1 = unchanged */
	scaleX: number;
	/** vertical scale, 1 = unchanged */
	scaleY: number;
	/** radians, positive = clockwise */
	rotate: number;
	/**
	 * Scale along the **rotated** axes (`R·S·R⁻¹`) instead of axis-aligned
	 * (`R·S`). A rotated selection must resize along its own edges, otherwise
	 * dragging a corner of a turned square would shear it.
	 */
	local?: boolean;
	/** pivot in css px inside the page */
	cx: number;
	cy: number;
	pageWidth: number;
	pageHeight: number;
}

const ELLIPSE_SAMPLES = 48;

export function snapshotStroke(stroke: Stroke): StrokeSnapshot {
	return {
		id: stroke.id,
		kind: stroke.kind,
		points: stroke.points.slice(),
		rings: stroke.rings ? stroke.rings.map((ring) => ring.slice()) : null,
		width: stroke.width,
	};
}

/** Restores a snapshot in place, so undo keeps working on the same object. */
export function restoreStroke(stroke: Stroke, snapshot: StrokeSnapshot): void {
	stroke.kind = snapshot.kind;
	stroke.points = snapshot.points.slice();
	if (snapshot.rings) stroke.rings = snapshot.rings.map((ring) => ring.slice());
	else delete stroke.rings;
	stroke.width = snapshot.width;
}

function outlineOf(snapshot: StrokeSnapshot, width: number, height: number): Array<[number, number]> {
	const x0 = snapshot.points[0] * width;
	const y0 = snapshot.points[1] * height;
	const x1 = snapshot.points[3] * width;
	const y1 = snapshot.points[4] * height;
	if (snapshot.kind === "rect") {
		return [
			[x0, y0],
			[x1, y0],
			[x1, y1],
			[x0, y1],
		];
	}
	const cx = (x0 + x1) / 2;
	const cy = (y0 + y1) / 2;
	const rx = Math.abs(x1 - x0) / 2;
	const ry = Math.abs(y1 - y0) / 2;
	const points: Array<[number, number]> = [];
	for (let i = 0; i < ELLIPSE_SAMPLES; i++) {
		const angle = (i / ELLIPSE_SAMPLES) * Math.PI * 2;
		points.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
	}
	return points;
}

/**
 * Re-applies `snapshot` with the transform. Always called with the original
 * snapshot, never with an already transformed stroke: no drift accumulates.
 */
export function applyTransform(
	stroke: Stroke,
	snapshot: StrokeSnapshot,
	transform: InkTransform,
): void {
	const { pageWidth: width, pageHeight: height } = transform;
	if (width <= 0 || height <= 0) return;
	const scaleX = clamp(transform.scaleX, 0.02, 40);
	const scaleY = clamp(transform.scaleY, 0.02, 40);
	const cos = Math.cos(transform.rotate);
	const sin = Math.sin(transform.rotate);
	// Linear part of the transform.
	let m11: number;
	let m12: number;
	let m21: number;
	let m22: number;
	if (transform.local) {
		m11 = cos * cos * scaleX + sin * sin * scaleY;
		m12 = cos * sin * (scaleX - scaleY);
		m21 = m12;
		m22 = sin * sin * scaleX + cos * cos * scaleY;
	} else {
		m11 = cos * scaleX;
		m12 = -sin * scaleY;
		m21 = sin * scaleX;
		m22 = cos * scaleY;
	}
	const mapX = (x: number, y: number): number => {
		const dx = x * width - transform.cx;
		const dy = y * height - transform.cy;
		return (transform.cx + m11 * dx + m12 * dy) / width;
	};
	const mapY = (x: number, y: number): number => {
		const dx = x * width - transform.cx;
		const dy = y * height - transform.cy;
		return (transform.cy + m21 * dx + m22 * dy) / height;
	};

	// A rect / ellipse is rendered axis aligned from two corners, so any shear
	// or rotation has to be baked into a polygon.
	const sheared = Math.abs(m12) > 1e-9 || Math.abs(m21) > 1e-9;
	// Width cannot follow a non-uniform scale; the area-preserving factor keeps
	// the pen from turning into a hairline.
	stroke.width = snapshot.width * Math.sqrt(Math.abs(m11 * m22 - m12 * m21));

	if (sheared && (snapshot.kind === "rect" || snapshot.kind === "ellipse")) {
		const outline = outlineOf(snapshot, width, height);
		const points: number[] = [];
		for (const [x, y] of outline) {
			points.push(mapX(x / width, y / height), mapY(x / width, y / height), 0.5);
		}
		stroke.kind = "polygon";
		stroke.points = points;
		delete stroke.rings;
		return;
	}

	const original = snapshot.points;
	const points = new Array<number>(original.length);
	for (let i = 0; i + 2 < original.length; i += 3) {
		const x = original[i];
		const y = original[i + 1];
		points[i] = mapX(x, y);
		points[i + 1] = mapY(x, y);
		points[i + 2] = original[i + 2];
	}
	stroke.points = points;

	if (snapshot.rings) {
		stroke.rings = snapshot.rings.map((ring) => {
			const moved = new Array<number>(ring.length);
			for (let i = 0; i + 1 < ring.length; i += 2) {
				moved[i] = mapX(ring[i], ring[i + 1]);
				moved[i + 1] = mapY(ring[i], ring[i + 1]);
			}
			return moved;
		});
	} else {
		delete stroke.rings;
	}
}

/** Bounds of the given snapshots, before any transform. */
export function boundsOfSnapshots(snapshots: StrokeSnapshot[]): Bounds {
	let x0 = Number.POSITIVE_INFINITY;
	let y0 = Number.POSITIVE_INFINITY;
	let x1 = Number.NEGATIVE_INFINITY;
	let y1 = Number.NEGATIVE_INFINITY;
	for (const snapshot of snapshots) {
		for (let i = 0; i + 1 < snapshot.points.length; i += 3) {
			x0 = Math.min(x0, snapshot.points[i]);
			x1 = Math.max(x1, snapshot.points[i]);
			y0 = Math.min(y0, snapshot.points[i + 1]);
			y1 = Math.max(y1, snapshot.points[i + 1]);
		}
		for (const ring of snapshot.rings ?? []) {
			for (let i = 0; i + 1 < ring.length; i += 2) {
				x0 = Math.min(x0, ring[i]);
				x1 = Math.max(x1, ring[i]);
				y0 = Math.min(y0, ring[i + 1]);
				y1 = Math.max(y1, ring[i + 1]);
			}
		}
	}
	return { x0, y0, x1, y1 };
}
