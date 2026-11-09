import { isShapeKind } from "./doc";
import type { ShapeKind, Stroke } from "./types";
import { clamp } from "./util";

const MIN_WIDTH_RATIO = 0.00002;
const MAX_WIDTH_RATIO = 0.25;

export function strokeWidthPx(stroke: Stroke, pageWidth: number): number {
	return clamp(stroke.width, MIN_WIDTH_RATIO, MAX_WIDTH_RATIO) * pageWidth;
}

function pointX(points: number[], index: number, pageWidth: number): number {
	return points[index * 3] * pageWidth;
}

function pointY(points: number[], index: number, pageHeight: number): number {
	return points[index * 3 + 1] * pageHeight;
}

function pointPressure(points: number[], index: number): number {
	const value = points[index * 3 + 2];
	return Number.isFinite(value) ? clamp(value, 0, 1) : 0.5;
}

/** Pressure sensitive width factor, calibrated so that 0.5 == 1.0. */
export function pressureWidthFactor(pressure: number): number {
	return 0.45 + 1.1 * pressure;
}

export function hasPressureVariation(stroke: Stroke): boolean {
	if (stroke.kind !== "pen" && stroke.kind !== "eraser") return false;
	const points = stroke.points;
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (let i = 2; i < points.length; i += 3) {
		const value = points[i];
		if (!Number.isFinite(value)) continue;
		if (value < min) min = value;
		if (value > max) max = value;
	}
	return Number.isFinite(min) && max - min > 0.03;
}

function traceSmoothPath(
	ctx: CanvasRenderingContext2D,
	points: number[],
	count: number,
	pageWidth: number,
	pageHeight: number,
): void {
	ctx.moveTo(pointX(points, 0, pageWidth), pointY(points, 0, pageHeight));
	if (count === 1) return;
	if (count === 2) {
		ctx.lineTo(pointX(points, 1, pageWidth), pointY(points, 1, pageHeight));
		return;
	}
	for (let i = 1; i < count - 1; i++) {
		const cx = pointX(points, i, pageWidth);
		const cy = pointY(points, i, pageHeight);
		const nx = pointX(points, i + 1, pageWidth);
		const ny = pointY(points, i + 1, pageHeight);
		ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
	}
	ctx.lineTo(
		pointX(points, count - 1, pageWidth),
		pointY(points, count - 1, pageHeight),
	);
}

function renderFreehand(
	ctx: CanvasRenderingContext2D,
	stroke: Stroke,
	pageWidth: number,
	pageHeight: number,
	baseWidth: number,
): void {
	const points = stroke.points;
	const count = Math.floor(points.length / 3);
	const variable = hasPressureVariation(stroke);

	// Constant-width strokes (highlighter, flat pen) are painted as ONE path.
	// Stamping them segment by segment multiplies the alpha where the segments
	// overlap, which turned translucent ink opaque — and made erased
	// highlighter look "lighter" than the rest of the same stroke.
	if (!variable) {
		if (count === 1) {
			ctx.beginPath();
			ctx.arc(
				pointX(points, 0, pageWidth),
				pointY(points, 0, pageHeight),
				Math.max(0.6, baseWidth / 2),
				0,
				Math.PI * 2,
			);
			ctx.fill();
			return;
		}
		ctx.beginPath();
		traceSmoothPath(ctx, points, count, pageWidth, pageHeight);
		ctx.lineWidth = Math.max(0.5, baseWidth);
		ctx.stroke();
		return;
	}

	if (count === 1) {
		const width = baseWidth * pressureWidthFactor(pointPressure(points, 0));
		ctx.beginPath();
		ctx.arc(
			pointX(points, 0, pageWidth),
			pointY(points, 0, pageHeight),
			Math.max(0.6, width / 2),
			0,
			Math.PI * 2,
		);
		ctx.fill();
		return;
	}

	for (let i = 0; i < count - 1; i++) {
		const width =
			baseWidth *
			pressureWidthFactor((pointPressure(points, i) + pointPressure(points, i + 1)) / 2);
		ctx.beginPath();
		ctx.moveTo(pointX(points, i, pageWidth), pointY(points, i, pageHeight));
		ctx.lineTo(
			pointX(points, i + 1, pageWidth),
			pointY(points, i + 1, pageHeight),
		);
		ctx.lineWidth = Math.max(0.4, width);
		ctx.stroke();
	}
}

function renderEraser(
	ctx: CanvasRenderingContext2D,
	stroke: Stroke,
	pageWidth: number,
	pageHeight: number,
	baseWidth: number,
): void {
	const points = stroke.points;
	const count = Math.floor(points.length / 3);
	if (count < 1) return;
	ctx.save();
	ctx.globalCompositeOperation = "destination-out";
	ctx.globalAlpha = 1;
	ctx.strokeStyle = "rgba(0,0,0,1)";
	ctx.fillStyle = "rgba(0,0,0,1)";
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	if (count === 1) {
		ctx.beginPath();
		ctx.arc(
			pointX(points, 0, pageWidth),
			pointY(points, 0, pageHeight),
			Math.max(1, baseWidth / 2),
			0,
			Math.PI * 2,
		);
		ctx.fill();
	} else {
		if (hasPressureVariation(stroke)) {
			// Pressure erasing: the swath grows with pen pressure segment by
			// segment, which is what makes "press harder to erase more" feel
			// right without changing the stored stroke width.
			for (let i = 0; i < count - 1; i++) {
				const pressure = (pointPressure(points, i) + pointPressure(points, i + 1)) / 2;
				ctx.beginPath();
				ctx.moveTo(pointX(points, i, pageWidth), pointY(points, i, pageHeight));
				ctx.lineTo(
					pointX(points, i + 1, pageWidth),
					pointY(points, i + 1, pageHeight),
				);
				ctx.lineWidth = Math.max(1, baseWidth * pressureWidthFactor(pressure));
				ctx.stroke();
			}
			ctx.restore();
			return;
		}
		ctx.beginPath();
		traceSmoothPath(ctx, points, count, pageWidth, pageHeight);
		ctx.lineWidth = Math.max(1, baseWidth);
		ctx.stroke();
	}
	ctx.restore();
}

function renderRectEraser(
	ctx: CanvasRenderingContext2D,
	stroke: Stroke,
	pageWidth: number,
	pageHeight: number,
): void {
	const points = stroke.points;
	if (points.length < 6) return;
	const x0 = pointX(points, 0, pageWidth);
	const y0 = pointY(points, 0, pageHeight);
	const x1 = pointX(points, 1, pageWidth);
	const y1 = pointY(points, 1, pageHeight);
	ctx.save();
	ctx.globalCompositeOperation = "destination-out";
	ctx.globalAlpha = 1;
	ctx.fillStyle = "#000";
	ctx.fillRect(
		Math.min(x0, x1),
		Math.min(y0, y1),
		Math.abs(x1 - x0),
		Math.abs(y1 - y0),
	);
	ctx.restore();
}

function renderLassoEraser(
	ctx: CanvasRenderingContext2D,
	stroke: Stroke,
	pageWidth: number,
	pageHeight: number,
): void {
	const points = stroke.points;
	const count = Math.floor(points.length / 3);
	if (count < 3) return;
	ctx.save();
	ctx.globalCompositeOperation = "destination-out";
	ctx.globalAlpha = 1;
	ctx.fillStyle = "#000";
	ctx.beginPath();
	ctx.moveTo(points[0] * pageWidth, points[1] * pageHeight);
	for (let i = 1; i < count; i++) {
		ctx.lineTo(points[i * 3] * pageWidth, points[i * 3 + 1] * pageHeight);
	}
	ctx.closePath();
	ctx.fill();
	ctx.restore();
}

function renderShape(
	ctx: CanvasRenderingContext2D,
	stroke: Stroke,
	kind: ShapeKind,
	pageWidth: number,
	pageHeight: number,
	baseWidth: number,
): void {
	const points = stroke.points;
	if (points.length < 6) return;
	const x0 = pointX(points, 0, pageWidth);
	const y0 = pointY(points, 0, pageHeight);
	const x1 = pointX(points, 1, pageWidth);
	const y1 = pointY(points, 1, pageHeight);
	const lineWidth = Math.max(0.5, baseWidth);
	const dx = x1 - x0;
	const dy = y1 - y0;

	ctx.save();
	ctx.strokeStyle = stroke.color;
	ctx.fillStyle = stroke.color;
	ctx.lineWidth = lineWidth;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.globalAlpha = ctx.globalAlpha * clamp(stroke.opacity, 0, 1);

	if (kind === "line" || kind === "arrow") {
		const length = Math.hypot(dx, dy);
		if (length < 0.5) {
			ctx.restore();
			return;
		}
		if (kind === "line") {
			ctx.beginPath();
			ctx.moveTo(x0, y0);
			ctx.lineTo(x1, y1);
			ctx.stroke();
		} else {
			const head = Math.min(
				Math.max(lineWidth * 6, 10),
				length * 0.5,
			);
			const ux = dx / length;
			const uy = dy / length;
			const bx = x1 - ux * head;
			const by = y1 - uy * head;
			// Shaft stops at the base of the head; the head itself is a solid
			// triangle so the tip is visibly pointed.
			ctx.beginPath();
			ctx.moveTo(x0, y0);
			ctx.lineTo(bx, by);
			ctx.stroke();
			const px = -uy;
			const py = ux;
			const half = Math.max(head * 0.55, lineWidth * 1.5);
			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(bx + px * half, by + py * half);
			ctx.lineTo(bx - px * half, by - py * half);
			ctx.closePath();
			ctx.fill();
		}
	} else if (kind === "rect") {
		ctx.beginPath();
		ctx.rect(x0, y0, dx, dy);
		ctx.stroke();
	} else if (kind === "ellipse") {
		const rx = Math.abs(dx) / 2;
		const ry = Math.abs(dy) / 2;
		if (rx < 0.5 || ry < 0.5) {
			ctx.restore();
			return;
		}
		ctx.beginPath();
		ctx.ellipse(x0 + dx / 2, y0 + dy / 2, rx, ry, 0, 0, Math.PI * 2);
		ctx.stroke();
	} else if (kind === "polygon") {
		const count = Math.floor(points.length / 3);
		if (count < 3) {
			ctx.restore();
			return;
		}
		ctx.beginPath();
		ctx.moveTo(x0, y0);
		for (let i = 1; i < count; i++) {
			ctx.lineTo(pointX(points, i, pageWidth), pointY(points, i, pageHeight));
		}
		ctx.closePath();
		// A cut arrow head keeps its solid look by staying a filled polygon.
		if (stroke.fill) ctx.fill();
		else ctx.stroke();
	}
	ctx.restore();
}

/**
 * Draw one stroke. The caller is responsible for `globalAlpha` (layer opacity);
 * `stroke.opacity` is multiplied on top of it.
 */
/** Outline strokes: filled rings, inner rings punch holes (even-odd). */
function renderRings(
	ctx: CanvasRenderingContext2D,
	stroke: Stroke,
	pageWidth: number,
	pageHeight: number,
): void {
	const rings = stroke.rings;
	if (!rings || rings.length === 0) return;
	ctx.save();
	ctx.globalAlpha = ctx.globalAlpha * clamp(stroke.opacity, 0, 1);
	ctx.fillStyle = stroke.color;
	ctx.beginPath();
	for (const ring of rings) {
		if (ring.length < 6) continue;
		ctx.moveTo(ring[0] * pageWidth, ring[1] * pageHeight);
		for (let i = 2; i + 1 < ring.length; i += 2) {
			ctx.lineTo(ring[i] * pageWidth, ring[i + 1] * pageHeight);
		}
		ctx.closePath();
	}
	ctx.fill("evenodd");
	ctx.restore();
}

export function renderStroke(
	ctx: CanvasRenderingContext2D,
	stroke: Stroke,
	pageWidth: number,
	pageHeight: number,
): void {
	if (pageWidth <= 0 || pageHeight <= 0) return;
	if (stroke.rings && stroke.rings.length > 0) {
		renderRings(ctx, stroke, pageWidth, pageHeight);
		return;
	}
	const count = Math.floor(stroke.points.length / 3);
	if (count < 1) return;
	const baseWidth = strokeWidthPx(stroke, pageWidth);
	if (baseWidth < 0.3) return;

	if (stroke.kind === "eraser") {
		renderEraser(ctx, stroke, pageWidth, pageHeight, baseWidth);
		return;
	}
	if (stroke.kind === "eraser-rect") {
		renderRectEraser(ctx, stroke, pageWidth, pageHeight);
		return;
	}
	if (stroke.kind === "eraser-lasso") {
		renderLassoEraser(ctx, stroke, pageWidth, pageHeight);
		return;
	}
	if (isShapeKind(stroke.kind)) {
		renderShape(ctx, stroke, stroke.kind, pageWidth, pageHeight, baseWidth);
		return;
	}

	ctx.save();
	ctx.globalAlpha = ctx.globalAlpha * clamp(stroke.opacity, 0, 1);
	ctx.strokeStyle = stroke.color;
	ctx.fillStyle = stroke.color;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	renderFreehand(ctx, stroke, pageWidth, pageHeight, baseWidth);
	ctx.restore();
}

function distanceToSegmentSq(
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
	let t = 0;
	if (lengthSq > 0) {
		t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
		t = clamp(t, 0, 1);
	}
	const x = ax + t * dx;
	const y = ay + t * dy;
	return (px - x) * (px - x) + (py - y) * (py - y);
}

/**
 * True when the normalized point (x, y) is close enough to the stroke.
 * `tolerancePx` is expressed in CSS pixels of the rendered page.
 */
export function hitTestStroke(
	stroke: Stroke,
	x: number,
	y: number,
	pageWidth: number,
	pageHeight: number,
	tolerancePx: number,
): boolean {
	if (pageWidth <= 0 || pageHeight <= 0) return false;
	const points = stroke.points;
	const count = Math.floor(points.length / 3);
	if (count < 1) return false;
	const radius = Math.max(1.5, strokeWidthPx(stroke, pageWidth) / 2) + tolerancePx;
	const radiusSq = radius * radius;
	const px = x * pageWidth;
	const py = y * pageHeight;

	// Cheap bounding box rejection first.
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (let i = 0; i < count; i++) {
		const cx = pointX(points, i, pageWidth);
		const cy = pointY(points, i, pageHeight);
		if (cx < minX) minX = cx;
		if (cy < minY) minY = cy;
		if (cx > maxX) maxX = cx;
		if (cy > maxY) maxY = cy;
	}
	if (px < minX - radius || px > maxX + radius) return false;
	if (py < minY - radius || py > maxY + radius) return false;

	if (count === 1) {
		const dx = px - minX;
		const dy = py - minY;
		return dx * dx + dy * dy <= radiusSq;
	}

	for (let i = 0; i < count - 1; i++) {
		const ax = pointX(points, i, pageWidth);
		const ay = pointY(points, i, pageHeight);
		const bx = pointX(points, i + 1, pageWidth);
		const by = pointY(points, i + 1, pageHeight);
		if (distanceToSegmentSq(px, py, ax, ay, bx, by) <= radiusSq) return true;
	}
	return false;
}
