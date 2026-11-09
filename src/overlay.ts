import {
	hasPressureVariation,
	pressureWidthFactor,
	renderStroke,
	strokeWidthPx,
} from "./geometry";
import type { InkDoc, Stroke } from "./types";
import { perf } from "./perf";
import { clamp } from "./util";

export interface LivePreview {
	layerId: string;
	stroke: Stroke;
}

export interface LiveGuide {
	kind: "rect" | "ellipse";
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

/**
 * Per-page overlay made of two visible canvases plus one offscreen canvas:
 *  - `committed` holds every visible layer composited together
 *  - `live` holds the stroke / shape that is currently being drawn
 *  - `layerCanvas` is reused to render one layer at a time so that eraser
 *    strokes only remove ink from their own layer
 */
/**
 * Upper bound for one canvas backing store. A full page at dpr 2 is ~10 Mpx;
 * Chromium re-uploads a 2D canvas as a single texture on every draw, which at
 * that size costs ~80-100 ms per stroke (measured as the long task right after
 * each commit). The blocking time scales with the canvas area, so the budget
 * is the main quality/smoothness knob.
 */
let canvasPixelBudget = 2_400_000;

export function setCanvasPixelBudget(pixels: number): void {
	canvasPixelBudget = clamp(pixels, 1_000_000, 16_000_000);
}

export function getCanvasPixelBudget(): number {
	return canvasPixelBudget;
}

/**
 * Chrome's `desynchronized` hint for the live canvas. Off by default: the spec
 * allows a desynchronized canvas to return stale/empty pixels when read, and
 * our commit path must never depend on that (it draws from stroke data now, but
 * the hint also made the user's handwriting feel worse — measured, not assumed).
 */
let lowLatencyLive = false;

export function setLowLatencyLive(value: boolean): void {
	lowLatencyLive = value;
}

export class PageOverlay {
	readonly pageEl: HTMLElement;
	readonly pageNumber: number;
	readonly committed: HTMLCanvasElement;
	readonly live: HTMLCanvasElement;

	private readonly layerCanvas: HTMLCanvasElement;
	private readonly ctxCommitted: CanvasRenderingContext2D | null;
	private readonly ctxLive: CanvasRenderingContext2D | null;
	private readonly ctxLayer: CanvasRenderingContext2D | null;
	private cssWidth = 0;
	private cssHeight = 0;
	private dpr = 1;
	private doc: InkDoc | null = null;
	private destroyed = false;
	private liveStrokeId: string | null = null;
	private liveDrawn = 0;
	/** css-px box the live canvas is known to have painted (null = whole). */
	private liveDirty: { x0: number; y0: number; x1: number; y1: number } | null = null;

	constructor(pageEl: HTMLElement, pageNumber: number) {
		this.pageEl = pageEl;
		this.pageNumber = pageNumber;
		const owner = pageEl.ownerDocument;

		this.committed = owner.createElement("canvas");
		this.committed.className = "pdf-ink-canvas pdf-ink-canvas-committed";
		this.committed.setAttribute("aria-hidden", "true");
		this.live = owner.createElement("canvas");
		this.live.className = "pdf-ink-canvas pdf-ink-canvas-live";
		this.live.setAttribute("aria-hidden", "true");
		this.layerCanvas = owner.createElement("canvas");

		pageEl.appendChild(this.committed);
		pageEl.appendChild(this.live);

		this.ctxCommitted = this.committed.getContext("2d");
		// Low-latency hint, opt-in only (see `setLowLatencyLive`).
		this.ctxLive = lowLatencyLive
			? this.live.getContext("2d", {
					desynchronized: true,
				} as CanvasRenderingContext2DSettings)
			: this.live.getContext("2d");
		this.ctxLayer = this.layerCanvas.getContext("2d");
		this.measure();
	}

	get widthPx(): number {
		return this.cssWidth;
	}

	get heightPx(): number {
		return this.cssHeight;
	}

	setDoc(doc: InkDoc | null): void {
		this.doc = doc;
	}

	/** Sync the backing store with the current on-screen size. */
	measure(): boolean {
		if (this.destroyed) return false;
		const rect = this.pageEl.getBoundingClientRect();
		const width = Math.max(1, Math.round(this.pageEl.clientWidth || rect.width));
		const height = Math.max(1, Math.round(this.pageEl.clientHeight || rect.height));
		const view = this.pageEl.ownerDocument.defaultView;
		const rawDpr = clamp(view?.devicePixelRatio ?? 1, 1, 2);
		const budget = canvasPixelBudget / Math.max(1, width * height);
		const dpr = clamp(Math.min(rawDpr, Math.sqrt(budget)), 1, 2);
		if (width === this.cssWidth && height === this.cssHeight && dpr === this.dpr) {
			return false;
		}
		this.cssWidth = width;
		this.cssHeight = height;
		this.dpr = dpr;
		this.liveStrokeId = null;
		this.liveDrawn = 0;
		this.liveDirty = null;
		for (const canvas of [this.committed, this.live, this.layerCanvas]) {
			canvas.width = Math.max(1, Math.round(width * dpr));
			canvas.height = Math.max(1, Math.round(height * dpr));
		}
		this.committed.setCssStyles({ width: `${width}px` });
		this.committed.setCssStyles({ height: `${height}px` });
		this.live.setCssStyles({ width: `${width}px` });
		this.live.setCssStyles({ height: `${height}px` });
		this.ctxCommitted?.setTransform(dpr, 0, 0, dpr, 0, 0);
		this.ctxLive?.setTransform(dpr, 0, 0, dpr, 0, 0);
		this.ctxLayer?.setTransform(dpr, 0, 0, dpr, 0, 0);
		return true;
	}

	/**
	 * pdf.js resets a page by removing every child node of `.page`, which also
	 * detaches our canvases. Re-append them and report whether that happened.
	 */
	ensureAttached(): boolean {
		if (this.destroyed) return false;
		let changed = false;
		if (this.committed.parentElement !== this.pageEl) {
			this.pageEl.appendChild(this.committed);
			changed = true;
		}
		if (this.live.parentElement !== this.pageEl) {
			this.pageEl.appendChild(this.live);
			changed = true;
		}
		return changed;
	}

	/**
	 * Recomposite all visible layers. When `preview` is given, the in-progress
	 * eraser stroke is appended to its layer (used for live erasing).
	 */
	render(preview?: LivePreview | null): void {
		if (this.destroyed) return;
		if (!perf.enabled) {
			this.renderInner(preview);
			return;
		}
		const done = perf.start("page.render");
		try {
			this.renderInner(preview);
		} finally {
			done();
		}
	}

	private renderInner(preview?: LivePreview | null): void {
		const ctx = this.ctxCommitted;
		const layerCtx = this.ctxLayer;
		if (!ctx || !layerCtx) return;

		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = "source-over";
		ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

		const doc = this.doc;
		if (!doc) return;

		for (const layer of doc.layers) {
			if (!layer.visible || layer.opacity <= 0) continue;
			layerCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
			layerCtx.globalAlpha = 1;
			layerCtx.globalCompositeOperation = "source-over";
			layerCtx.clearRect(0, 0, this.cssWidth, this.cssHeight);

			for (const stroke of layer.strokes) {
				if (stroke.page !== this.pageNumber) continue;
				renderStroke(layerCtx, stroke, this.cssWidth, this.cssHeight);
			}
			if (preview && preview.layerId === layer.id && preview.stroke.page === this.pageNumber) {
				renderStroke(layerCtx, preview.stroke, this.cssWidth, this.cssHeight);
			}

			ctx.globalAlpha = clamp(layer.opacity, 0, 1);
			ctx.drawImage(this.layerCanvas, 0, 0, this.cssWidth, this.cssHeight);
		}
		ctx.globalAlpha = 1;
	}

	/**
	 * Re-renders only a normalized rectangle of the page.
	 *
	 * Erasing one swath used to re-stroke every stroke on the page, which on a
	 * page with a few hundred of them showed up as an ~95 ms long task right at
	 * the end of the gesture. Only the ink that can touch the box is redrawn.
	 */
	renderRegion(box: { x0: number; y0: number; x1: number; y1: number }): void {
		if (this.destroyed) return;
		const ctx = this.ctxCommitted;
		const layerCtx = this.ctxLayer;
		if (!ctx || !layerCtx) return;
		const doc = this.doc;
		if (!doc) return;
		// A little slack: stroke width, round caps and pressure widening all
		// paint outside the centerline bounds.
		const padX = 8 / Math.max(1, this.cssWidth);
		const padY = 8 / Math.max(1, this.cssHeight);
		const x0 = Math.max(0, Math.min(box.x0, box.x1) - padX);
		const y0 = Math.max(0, Math.min(box.y0, box.y1) - padY);
		const x1 = Math.min(1, Math.max(box.x0, box.x1) + padX);
		const y1 = Math.min(1, Math.max(box.y0, box.y1) + padY);
		if (x1 <= x0 || y1 <= y0) return;

		const done = perf.enabled ? perf.start("page.renderRegion") : null;
		try {
			const px = x0 * this.cssWidth;
			const py = y0 * this.cssHeight;
			const pw = (x1 - x0) * this.cssWidth;
			const ph = (y1 - y0) * this.cssHeight;
			ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
			ctx.globalAlpha = 1;
			ctx.globalCompositeOperation = "source-over";
			ctx.clearRect(px, py, pw, ph);

			for (const layer of doc.layers) {
				if (!layer.visible || layer.opacity <= 0) continue;
				layerCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
				layerCtx.globalAlpha = 1;
				layerCtx.globalCompositeOperation = "source-over";
				layerCtx.clearRect(px, py, pw, ph);
				layerCtx.save();
				layerCtx.beginPath();
				layerCtx.rect(px, py, pw, ph);
				layerCtx.clip();
				for (const stroke of layer.strokes) {
					if (stroke.page !== this.pageNumber) continue;
					if (!this.strokeTouches(stroke, x0, y0, x1, y1)) continue;
					renderStroke(layerCtx, stroke, this.cssWidth, this.cssHeight);
				}
				layerCtx.restore();

				ctx.globalAlpha = clamp(layer.opacity, 0, 1);
				// Copy only the dirty slice, in device pixels.
				ctx.drawImage(
					this.layerCanvas,
					px * this.dpr,
					py * this.dpr,
					pw * this.dpr,
					ph * this.dpr,
					px,
					py,
					pw,
					ph,
				);
			}
			ctx.globalAlpha = 1;
		} finally {
			done?.();
		}
	}

	/** Cheap bbox test used to skip strokes that cannot touch a dirty box. */
	private strokeTouches(
		stroke: Stroke,
		x0: number,
		y0: number,
		x1: number,
		y1: number,
	): boolean {
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		const points = stroke.points;
		for (let i = 0; i + 1 < points.length; i += 3) {
			const x = points[i];
			const y = points[i + 1];
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
		for (const ring of stroke.rings ?? []) {
			for (let i = 0; i + 1 < ring.length; i += 2) {
				const x = ring[i];
				const y = ring[i + 1];
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
		if (!Number.isFinite(minX)) return false;
		return maxX >= x0 && minX <= x1 && maxY >= y0 && minY <= y1;
	}

	/** Draw the in-progress freehand stroke / shape on the top canvas. */
	drawLive(stroke: Stroke, layerOpacity: number, guide?: LiveGuide): void {		if (this.destroyed) return;
		const ctx = this.ctxLive;
		if (!ctx) return;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.globalAlpha = 1;
		// Constant-width strokes are re-traced as one path every frame (that is
		// what keeps translucent highlighter from stacking); only the box they
		// cover needs clearing, not the whole page.
		const dirty = this.liveDirty;
		if (dirty) {
			const pad = 2;
			ctx.clearRect(
				dirty.x0 - pad,
				dirty.y0 - pad,
				dirty.x1 - dirty.x0 + pad * 2,
				dirty.y1 - dirty.y0 + pad * 2,
			);
		} else {
			ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
		}
		ctx.globalAlpha = clamp(layerOpacity, 0, 1);
		renderStroke(ctx, stroke, this.cssWidth, this.cssHeight);
		ctx.globalAlpha = 1;
		this.liveDirty = this.damageBox(stroke);
		if (guide) this.drawGuide(ctx, guide);
	}

	/**
	 * Incremental freehand rendering: appendLive only draws the segments that
	 * were added since the last call, which keeps pen latency low even for long
	 * strokes at high DPI.
	 */
	beginLive(stroke: Stroke, layerOpacity: number): void {
		if (this.destroyed) return;
		const ctx = this.ctxLive;
		if (!ctx) return;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		// Clearing the whole canvas invalidates the entire layer; only the box
		// the previous stroke touched needs to go. Falls back to a full clear
		// when the canvas was just resized or something else drew on it.
		const dirty = this.liveDirty;
		if (dirty) {
			const pad = 2;
			ctx.clearRect(
				dirty.x0 - pad,
				dirty.y0 - pad,
				dirty.x1 - dirty.x0 + pad * 2,
				dirty.y1 - dirty.y0 + pad * 2,
			);
		} else {
			ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
		}
		this.liveStrokeId = stroke.id;
		this.liveDrawn = 0;
		this.appendLiveInner(stroke, layerOpacity);
	}

	appendLive(stroke: Stroke, layerOpacity: number): void {
		if (this.destroyed) return;
		if (!perf.enabled) {
			this.appendLiveInner(stroke, layerOpacity);
			return;
		}
		const done = perf.start("live.append");
		try {
			this.appendLiveInner(stroke, layerOpacity);
		} finally {
			done();
		}
	}

	private appendLiveInner(stroke: Stroke, layerOpacity: number): void {
		const ctx = this.ctxLive;
		if (!ctx) return;
		if (this.liveStrokeId !== stroke.id) {
			this.beginLive(stroke, layerOpacity);
			return;
		}
		const points = stroke.points;
		const count = Math.floor(points.length / 3);
		if (count <= this.liveDrawn) return;
		const w = this.cssWidth;
		const h = this.cssHeight;
		const base = strokeWidthPx(stroke, w);
		const variable = hasPressureVariation(stroke);

		// Constant-width ink (highlighter) is one continuous translucent path:
		// appending segments would stack the alpha and darken the stroke.
		if (!variable) {
			this.drawLive(stroke, layerOpacity);
			this.liveDrawn = count;
			return;
		}

		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.globalAlpha = clamp(layerOpacity * clamp(stroke.opacity, 0, 1), 0, 1);
		ctx.strokeStyle = stroke.color;
		ctx.fillStyle = stroke.color;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";

		if (this.liveDrawn === 0) {
			const dotWidth = variable
				? base * pressureWidthFactor(points[2] ?? 0.5)
				: base;
			ctx.beginPath();
			ctx.arc(points[0] * w, points[1] * h, Math.max(0.6, dotWidth / 2), 0, Math.PI * 2);
			ctx.fill();
			this.liveDrawn = 1;
		}
		const start = Math.max(0, this.liveDrawn - 1);
		for (let i = start; i < count - 1; i++) {
			ctx.beginPath();
			ctx.moveTo(points[i * 3] * w, points[i * 3 + 1] * h);
			ctx.lineTo(points[(i + 1) * 3] * w, points[(i + 1) * 3 + 1] * h);
			if (variable) {
				const pressure =
					((points[i * 3 + 2] ?? 0.5) + (points[(i + 1) * 3 + 2] ?? 0.5)) / 2;
				ctx.lineWidth = Math.max(0.4, base * pressureWidthFactor(pressure));
			} else {
				ctx.lineWidth = Math.max(0.4, base);
			}
			ctx.stroke();
		}
		this.liveDrawn = count;
		ctx.globalAlpha = 1;
		this.liveDirty = this.damageBox(stroke);
	}

	/**
	 * Commit a finished stroke on top of the already composited page. Only
	 * valid when the stroke belongs to the topmost visible layer; otherwise a
	 * full recomposite is required.
	 */
	appendCommitted(stroke: Stroke, layerOpacity: number): void {
		if (this.destroyed) return;
		const ctx = this.ctxCommitted;
		if (!ctx) return;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.globalAlpha = clamp(layerOpacity, 0, 1);
		renderStroke(ctx, stroke, this.cssWidth, this.cssHeight);
		ctx.globalAlpha = 1;
	}

	/**
	 * Dashed selection frame plus its transform handles. The frame is an
	 * oriented rectangle (`angle` in radians, corners in local space), so a
	 * rotated selection keeps a tight box that turns with the ink instead of
	 * an axis-aligned box that grows and shrinks while rotating.
	 */
	drawSelection(
		options: {
			frame?: FramePx;
			handles?: boolean;
			label?: string;
			/** pin the rotate knob to one edge (used mid-rotation) */
			knobEdge?: number;
		} = {},
	): void {
		if (this.destroyed) return;
		const ctx = this.ctxLive;
		if (!ctx) return;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.globalAlpha = 1;
		ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
		this.live.setCssStyles({ opacity: "" });

		const frame = options.frame;
		if (!frame) return;
		if (!Number.isFinite(frame.hw) || !Number.isFinite(frame.hh)) return;
		const page = { width: this.cssWidth, height: this.cssHeight };

		ctx.save();
		ctx.strokeStyle = "rgba(76, 140, 255, 0.9)";
		ctx.lineWidth = 1;
		ctx.setLineDash?.([6, 4]);
		ctx.translate(frame.cx, frame.cy);
		ctx.rotate(frame.angle);
		ctx.strokeRect(-frame.hw, -frame.hh, frame.hw * 2, frame.hh * 2);
		ctx.setLineDash?.([]);
		ctx.restore();

		if (options.handles) {
			const corners = frameCorners(frame);
			const edges = frameEdges(frame);
			const knob = selectionKnob(frame, page, options.knobEdge);
			const knobEdge = edges[options.knobEdge ?? selectionKnobEdge(frame)];
			ctx.save();
			// The connector inherits whatever strokeStyle the last rendered
			// stroke left behind (i.e. the pen colour) unless it is set here.
			ctx.strokeStyle = "rgba(76, 140, 255, 0.9)";
			ctx.lineWidth = 1;
			ctx.setLineDash?.([3, 3]);
			ctx.beginPath();
			ctx.moveTo(knobEdge.mx, knobEdge.my);
			ctx.lineTo(knob.x, knob.y);
			ctx.stroke();
			ctx.setLineDash?.([]);
			ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
			ctx.strokeStyle = "rgba(76, 140, 255, 1)";
			ctx.lineWidth = 1.5;
			for (const corner of corners) {
				const size = 9;
				ctx.beginPath();
				ctx.rect(corner.x - size / 2, corner.y - size / 2, size, size);
				ctx.fill();
				ctx.stroke();
			}
			// Edge midpoints: one axis of scaling each.
			for (const edge of edges) {
				const size = 7;
				ctx.beginPath();
				ctx.rect(edge.mx - size / 2, edge.my - size / 2, size, size);
				ctx.fill();
				ctx.stroke();
			}
			ctx.beginPath();
			ctx.arc(knob.x, knob.y, 5.5, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
			ctx.restore();
		}

		if (options.label) {
			// Above the knob: the knob follows the pointer, so does the readout.
			const knob = selectionKnob(frame, page, options.knobEdge);
			this.drawBadge(ctx, options.label, knob.x, knob.y - 30);
		}
	}

	private drawBadge(
		ctx: CanvasRenderingContext2D,
		text: string,
		centerX: number,
		top: number,
	): void {
		const padX = 7;
		const width = Math.max(34, text.length * 7 + padX * 2);
		const height = 18;
		const left = centerX - width / 2;
		const y = Math.max(2, top);
		ctx.save();
		ctx.setLineDash?.([]);
		ctx.globalAlpha = 0.92;
		ctx.fillStyle = "rgba(30, 30, 30, 0.86)";
		ctx.beginPath();
		ctx.rect(left, y, width, height);
		ctx.fill();
		ctx.globalAlpha = 1;
		ctx.fillStyle = "#ffffff";
		ctx.font = "11px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		(ctx as CanvasRenderingContext2D & { fillText?: (t: string, x: number, y: number) => void }).fillText?.(text, centerX, y + height / 2);
		ctx.restore();
	}

	/** Dashed freehand outline used by the lasso eraser. */
	drawFreehandGuide(stroke: Stroke): void {
		if (this.destroyed) return;
		const ctx = this.ctxLive;
		if (!ctx) return;
		const points = stroke.points;
		const count = Math.floor(points.length / 3);
		if (count < 2) return;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.globalAlpha = 1;
		ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
		ctx.save();
		ctx.strokeStyle = "rgba(76, 140, 255, 0.9)";
		ctx.lineWidth = 1;
		ctx.setLineDash?.([5, 4]);
		ctx.beginPath();
		ctx.moveTo(points[0] * this.cssWidth, points[1] * this.cssHeight);
		for (let i = 1; i < count; i++) {
			ctx.lineTo(
				points[i * 3] * this.cssWidth,
				points[i * 3 + 1] * this.cssHeight,
			);
		}
		if (count > 2) ctx.closePath();
		ctx.stroke();
		ctx.restore();
	}

	/**
	 * Finishes a freehand stroke by drawing it **vectorially** into the
	 * composite.
	 *
	 * It used to blit the live canvas instead (one `drawImage`), which is faster
	 * in theory — but a canvas is not a reliable source: with
	 * `desynchronized: true` the spec explicitly allows stale or empty pixels,
	 * and that showed up as "the stroke vanishes the moment I lift the pen".
	 * Drawing from the stroke data is exact, crisp and still sub-millisecond.
	 */
	commitLive(stroke: Stroke, layerOpacity: number): void {
		if (this.destroyed) return;
		const ctx = this.ctxCommitted;
		if (!ctx) return;
		const done = perf.enabled ? perf.start("commit.vector") : null;
		try {
			ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
			ctx.globalCompositeOperation = "source-over";
			ctx.globalAlpha = clamp(layerOpacity, 0, 1);
			renderStroke(ctx, stroke, this.cssWidth, this.cssHeight);
			ctx.globalAlpha = 1;
		} finally {
			done?.();
		}
		this.live.setCssStyles({ opacity: "" });
		this.clearLive();
		this.liveStrokeId = null;
		this.liveDrawn = 0;
	}

	/** Stroke extent in css px, padded by its width (pressure can widen it). */
	private damageBox(stroke: Stroke): { x0: number; y0: number; x1: number; y1: number } | null {
		let x0 = Number.POSITIVE_INFINITY;
		let y0 = Number.POSITIVE_INFINITY;
		let x1 = Number.NEGATIVE_INFINITY;
		let y1 = Number.NEGATIVE_INFINITY;
		const points = stroke.points;
		for (let i = 0; i + 1 < points.length; i += 3) {
			x0 = Math.min(x0, points[i] * this.cssWidth);
			x1 = Math.max(x1, points[i] * this.cssWidth);
			y0 = Math.min(y0, points[i + 1] * this.cssHeight);
			y1 = Math.max(y1, points[i + 1] * this.cssHeight);
		}
		for (const ring of stroke.rings ?? []) {
			for (let i = 0; i + 1 < ring.length; i += 2) {
				x0 = Math.min(x0, ring[i] * this.cssWidth);
				x1 = Math.max(x1, ring[i] * this.cssWidth);
				y0 = Math.min(y0, ring[i + 1] * this.cssHeight);
				y1 = Math.max(y1, ring[i + 1] * this.cssHeight);
			}
		}
		if (!Number.isFinite(x0)) return null;
		const pad = Math.max(4, strokeWidthPx(stroke, this.cssWidth));
		return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
	}

	/** Dashed rectangle/circle used while a shape snaps to square / circle. */	drawGuideOnly(guide: LiveGuide): void {
		if (this.destroyed) return;
		const ctx = this.ctxLive;
		if (!ctx) return;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.globalAlpha = 1;
		ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
		this.drawGuide(ctx, guide);
	}

	private drawGuide(ctx: CanvasRenderingContext2D, guide: LiveGuide): void {
		const w = this.cssWidth;
		const h = this.cssHeight;
		const x0 = guide.x0 * w;
		const y0 = guide.y0 * h;
		const x1 = guide.x1 * w;
		const y1 = guide.y1 * h;
		ctx.save();
		ctx.strokeStyle = "rgba(76, 140, 255, 0.9)";
		ctx.lineWidth = 1;
		ctx.setLineDash?.([5, 4]);
		ctx.beginPath();
		if (guide.kind === "rect") {
			ctx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
		} else {
			ctx.ellipse(
				x0 + (x1 - x0) / 2,
				y0 + (y1 - y0) / 2,
				Math.abs(x1 - x0) / 2,
				Math.abs(y1 - y0) / 2,
				0,
				0,
				Math.PI * 2,
			);
		}
		ctx.stroke();
		ctx.setLineDash?.([2, 4]);
		ctx.beginPath();
		ctx.moveTo(x0 + (x1 - x0) / 2, Math.min(y0, y1) - 12);
		ctx.lineTo(x0 + (x1 - x0) / 2, Math.max(y0, y1) + 12);
		ctx.moveTo(Math.min(x0, x1) - 12, y0 + (y1 - y0) / 2);
		ctx.lineTo(Math.max(x0, x1) + 12, y0 + (y1 - y0) / 2);
		ctx.stroke();
		ctx.restore();
	}

	clearLive(): void {
		const ctx = this.ctxLive;
		if (!ctx) return;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
		this.live.setCssStyles({ opacity: "" });
		this.liveDirty = null;
	}

	destroy(): void {
		this.destroyed = true;
		this.committed.remove();
		this.live.remove();
		this.doc = null;
	}
}

/** Distance from the selection frame to the rotate knob, in css px. */
export const SELECTION_ROTATE_OFFSET_PX = 22;
/** Half-size of the grab area of a corner handle, in css px. */
export const SELECTION_HANDLE_HIT_PX = 11;

/** Oriented selection rectangle, all values in css px of the page. */
export interface FramePx {
	/** center */
	cx: number;
	cy: number;
	/** half extents along the frame's own axes */
	hw: number;
	hh: number;
	/** rotation of the frame, radians clockwise */
	angle: number;
}

/** Corners in local order: nw, ne, se, sw. */
export function frameCorners(frame: FramePx): Array<{ x: number; y: number }> {
	const cos = Math.cos(frame.angle);
	const sin = Math.sin(frame.angle);
	const local: Array<[number, number]> = [
		[-frame.hw, -frame.hh],
		[frame.hw, -frame.hh],
		[frame.hw, frame.hh],
		[-frame.hw, frame.hh],
	];
	return local.map(([lx, ly]) => ({
		x: frame.cx + lx * cos - ly * sin,
		y: frame.cy + lx * sin + ly * cos,
	}));
}

/**
 * Midpoint and outward normal of each edge, in local order
 * (nw→ne, ne→se, se→sw, sw→nw).
 */
export function frameEdges(
	frame: FramePx,
): Array<{ mx: number; my: number; nx: number; ny: number }> {
	const cos = Math.cos(frame.angle);
	const sin = Math.sin(frame.angle);
	const local: Array<[number, number, number, number]> = [
		[0, -frame.hh, 0, -1],
		[frame.hw, 0, 1, 0],
		[0, frame.hh, 0, 1],
		[-frame.hw, 0, -1, 0],
	];
	return local.map(([lx, ly, nx, ny]) => ({
		mx: frame.cx + lx * cos - ly * sin,
		my: frame.cy + lx * sin + ly * cos,
		nx: nx * cos - ny * sin,
		ny: nx * sin + ny * cos,
	}));
}

/**
 * Rotate knob: on the edge whose midpoint is highest on screen, pushed
 * outward along that edge's normal — so it is always "on the upper side" of
 * the frame, whichever way the selection was rotated. `edge` pins it to a
 * specific edge, which is what a rotation drag needs so the knob does not hop
 * to another side halfway through the turn.
 */
export function selectionKnob(
	frame: FramePx,
	page?: { width: number; height: number },
	edge?: number,
): { x: number; y: number } {
	const edges = frameEdges(frame);
	const best = edges[edge ?? selectionKnobEdge(frame)] ?? edges[0];
	const length = Math.hypot(best.nx, best.ny) || 1;
	let x = best.mx + (best.nx / length) * SELECTION_ROTATE_OFFSET_PX;
	let y = best.my + (best.ny / length) * SELECTION_ROTATE_OFFSET_PX;
	if (page) {
		x = Math.min(Math.max(x, 10), Math.max(10, page.width - 10));
		y = Math.min(Math.max(y, 10), Math.max(10, page.height - 10));
	}
	return { x, y };
}

/** Index of the edge that currently carries the rotate knob. */
export function selectionKnobEdge(frame: FramePx): number {
	const edges = frameEdges(frame);
	let best = 0;
	for (let i = 1; i < edges.length; i++) {
		if (edges[i].my < edges[best].my - 0.001) best = i;
	}
	return best;
}

/** Axis-aligned frame of a normalized box (used when a selection is created). */
export function frameFromBox(
	box: { x0: number; y0: number; x1: number; y1: number },
	width: number,
	height: number,
): FramePx {
	return {
		cx: ((box.x0 + box.x1) / 2) * width,
		cy: ((box.y0 + box.y1) / 2) * height,
		hw: Math.max(1, ((box.x1 - box.x0) / 2) * width),
		hh: Math.max(1, ((box.y1 - box.y0) / 2) * height),
		angle: 0,
	};
}

