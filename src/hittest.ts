import type { Stroke } from "./types";

/**
 * Point-in-stroke test used by "erase whole stroke" and "delete whole stroke".
 * Works on the rendered geometry (px space), so it matches what the user sees.
 */

export interface HitOptions {
	/** extra slack around the rendered stroke, in css px */
	tolerancePx: number;
}

const DEFAULT_TOLERANCE = 6;

export function strokeHitTest(
	stroke: Stroke,
	x: number,
	y: number,
	pageWidth: number,
	pageHeight: number,
	options: Partial<HitOptions> = {},
): boolean {
	if (stroke.kind === "eraser" || stroke.kind === "eraser-rect" || stroke.kind === "eraser-lasso") {
		return false;
	}
	if (stroke.rings && stroke.rings.length > 0) {
		return ringsHit(stroke.rings, x, y, options.tolerancePx ?? DEFAULT_TOLERANCE, pageWidth);
	}
	const count = Math.floor(stroke.points.length / 3);
	if (count < 1) return false;

	const px = x * pageWidth;
	const py = y * pageHeight;
	const halfWidth = (stroke.width * pageWidth) / 2;
	const slack = Math.max(halfWidth, 0) + (options.tolerancePx ?? DEFAULT_TOLERANCE);

	if (count === 1) {
		return Math.hypot(stroke.points[0] * pageWidth - px, stroke.points[1] * pageHeight - py) <= slack;
	}

	const kind = stroke.kind;
	if (kind === "rect") {
		return hitAxisBox(stroke, px, py, pageWidth, pageHeight, slack);
	}
	if (kind === "ellipse") {
		const x0 = stroke.points[0] * pageWidth;
		const y0 = stroke.points[1] * pageHeight;
		const x1 = stroke.points[3] * pageWidth;
		const y1 = stroke.points[4] * pageHeight;
		const rx = Math.abs(x1 - x0) / 2;
		const ry = Math.abs(y1 - y0) / 2;
		if (rx < 0.5 || ry < 0.5) return false;
		const cx = x0 + (x1 - x0) / 2;
		const cy = y0 + (y1 - y0) / 2;
		const value = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2;
		const radial = Math.sqrt(value);
		// Distance from the outline, approximated with the mean radius.
		return Math.abs(radial - 1) * ((rx + ry) / 2) <= slack;
	}

	const closed = kind === "polygon";
	let best = Number.POSITIVE_INFINITY;
	for (let i = 0; i < count - 1; i++) {
		best = Math.min(
			best,
			segmentDistance(
				px,
				py,
				stroke.points[i * 3] * pageWidth,
				stroke.points[i * 3 + 1] * pageHeight,
				stroke.points[(i + 1) * 3] * pageWidth,
				stroke.points[(i + 1) * 3 + 1] * pageHeight,
			),
		);
	}
	if (closed && count > 2) {
		best = Math.min(
			best,
			segmentDistance(
				px,
				py,
				stroke.points[(count - 1) * 3] * pageWidth,
				stroke.points[(count - 1) * 3 + 1] * pageHeight,
				stroke.points[0] * pageWidth,
				stroke.points[1] * pageHeight,
			),
		);
	}
	return best <= slack;
}

function hitAxisBox(
	stroke: Stroke,
	px: number,
	py: number,
	pageWidth: number,
	pageHeight: number,
	slack: number,
): boolean {
	const x0 = stroke.points[0] * pageWidth;
	const y0 = stroke.points[1] * pageHeight;
	const x1 = stroke.points[3] * pageWidth;
	const y1 = stroke.points[4] * pageHeight;
	const left = Math.min(x0, x1);
	const right = Math.max(x0, x1);
	const top = Math.min(y0, y1);
	const bottom = Math.max(y0, y1);
	const nearLeft = Math.abs(px - left) <= slack && py >= top - slack && py <= bottom + slack;
	const nearRight = Math.abs(px - right) <= slack && py >= top - slack && py <= bottom + slack;
	const nearTop = Math.abs(py - top) <= slack && px >= left - slack && px <= right + slack;
	const nearBottom = Math.abs(py - bottom) <= slack && px >= left - slack && px <= right + slack;
	return nearLeft || nearRight || nearTop || nearBottom;
}

function segmentDistance(
	px: number,
	py: number,
	ax: number,
	ay: number,
	bx: number,
	by: number,
): number {
	const dx = bx - ax;
	const dy = by - ay;
	const lengthSq = dx * dx + dy * dy;
	if (lengthSq < 1e-9) return Math.hypot(px - ax, py - ay);
	let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Point-in-rings test with a tolerance band around every contour. */
function ringsHit(
	rings: number[][],
	x: number,
	y: number,
	tolerancePx: number,
	pageWidth: number,
): boolean {
	let inside = false;
	let nearEdge = false;
	const slack = tolerancePx / Math.max(1, pageWidth);
	for (const ring of rings) {
		for (let i = 0; i + 1 < ring.length; i += 2) {
			const x1 = ring[i];
			const y1 = ring[i + 1];
			const x2 = ring[(i + 2) % ring.length];
			const y2 = ring[(i + 3) % ring.length];
			if (x1 > x !== x2 > x && y < ((y2 - y1) * (x - x1)) / (x2 - x1 || 1e-9) + y1) {
				inside = !inside;
			}
			const dx = x2 - x1;
			const dy = y2 - y1;
			const lengthSq = dx * dx + dy * dy;
			let t = lengthSq > 1e-12 ? ((x - x1) * dx + (y - y1) * dy) / lengthSq : 0;
			t = Math.max(0, Math.min(1, t));
			const px = x1 + t * dx;
			const py = y1 + t * dy;
			if ((x - px) ** 2 + (y - py) ** 2 <= slack * slack) nearEdge = true;
		}
	}
	return inside || nearEdge;
}
