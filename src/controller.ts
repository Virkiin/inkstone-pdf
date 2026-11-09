import { Notice } from "obsidian";
import type { TFile, WorkspaceLeaf } from "obsidian";
import type PdfInkPlugin from "./main";
import {
	createDoc,
	createLayer,
	findLayer,
	getActiveLayer,
} from "./doc";
import { History } from "./history";
import type { EraserGeometry } from "./erase";
import { eraseInk } from "./erase";
import { pressureWidthFactor } from "./geometry";
import { strokeHitTest } from "./hittest";
import { PageOverlay } from "./overlay";
import type { FramePx, LiveGuide } from "./overlay";
import {
	frameCorners,
	frameEdges,
	frameFromBox,
	SELECTION_HANDLE_HIT_PX,
	SELECTION_ROTATE_OFFSET_PX,
	selectionKnob,
	selectionKnobEdge,
} from "./overlay";
import { perf } from "./perf";
import { recognizeStroke } from "./recognize";
import type { RecognizedShape } from "./recognize";
import { applyTransform, restoreStroke, snapshotStroke } from "./transform";
import type { InkTransform, StrokeSnapshot } from "./transform";
import type { InkDoc, Layer, ShapeKind, Stroke } from "./types";
import { SelectionMenu } from "./ui/selection-menu";
import { PdfInkToolbar } from "./ui/toolbar";
import type { Box } from "./ui/place";
import { REFERENCE_PAGE_WIDTH, clamp, uid } from "./util";

interface FreehandSession {
	type: "freehand";
	overlay: PageOverlay;
	layerId: string;
	layerOpacity: number;
	stroke: Stroke;
	lastX: number;
	lastY: number;
	/** pressure of the latest sample, used by hold-to-erase */
	lastPressure: number;
	/** perf.now() of the latest sample, used by auto shape recognition */
	lastPointAt: number;
}

interface ShapeSession {
	type: "shape";
	overlay: PageOverlay;
	layerId: string;
	layerOpacity: number;
	stroke: Stroke;
	startX: number;
	startY: number;
	guide?: LiveGuide;
}

type Session = FreehandSession | ShapeSession | StrokeEraseSession;

/**
 * "Erase / delete whole stroke" session: strokes are removed as the pointer
 * sweeps over them, and one history entry restores all of them at once.
 */
interface StrokeEraseSession {
	type: "stroke-erase";
	overlay: PageOverlay;
	layerId: string;
	removed: Array<{ stroke: Stroke; index: number }>;
	/** ids already handled, so a stroke is not recorded twice */
	seen: Set<string>;
}

interface EraseSession {
	overlay: PageOverlay;
	layerId: string;
	layerOpacity: number;
	stroke: Stroke;
	lastX: number;
	lastY: number;
}

/** Corner / knob drag: one undo entry, live from the original snapshots. */
interface TransformSession {
	kind: "scale" | "rotate";
	overlay: PageOverlay;
	ids: string[];
	snapshots: Map<string, StrokeSnapshot>;
	/** pivot of the transform, in css px */
	cx: number;
	cy: number;
	startX: number;
	startY: number;
	startAngle: number;
	/** frame angle at the start of the drag (radians) */
	frameAngle: number;
	/** frame the drag started from, restored by undo */
	frame0: SelectionFrame;
	/** edge the rotate knob sits on, pinned for the whole turn */
	knobEdge: number;
	/** fixed-size frame that turns with the hand while rotating */
	preview: FramePx | null;
	/** set for edge handles: only this axis may scale */
	axis: "x" | "y" | null;
	scaleX: number;
	scaleY: number;
	rotate: number;
	label: string;
}

/** Oriented selection frame, normalized to the page box (see FramePx). */
interface SelectionFrame {
	cx: number;
	cy: number;
	hw: number;
	hh: number;
	angle: number;
}

/** Corner scale, edge scale (n/e/s/w) or rotate knob. */
type HandleName = "nw" | "ne" | "se" | "sw" | "n" | "e" | "s" | "w" | "rotate";

interface PagePoint {
	x: number;
	y: number;
	p: number;
}

const SHAPE_TOOLS: ShapeKind[] = ["line", "arrow", "rect", "ellipse"];
const MIN_POINT_DISTANCE_PX = 1.2;
const MIN_SHAPE_SIZE_PX = 3;
/** Below this on-page width the brush cursor is a point, above it a ring. */
const THIN_BRUSH_PX = 6;
/** How far the pen may drift before a "hold" stops counting as a hold.
 *  Tablets jitter while resting, so this is deliberately a bit loose. */
const HOLD_CANCEL_PX = 5;
/** How often the hold gesture re-checks pen pressure inside its window. */
const HOLD_POLL_MS = 60;

/**
 * Shifts a stroke (centerline or outline) by a normalized delta.
 *
 * Deliberately unclamped: clamping each point to [0,1] does not stop the move,
 * it *squashes* the ink against the page border, so a pasted block bigger than
 * the page could never be repositioned. Ink is allowed to hang over the edge
 * (the canvas clips it); undo brings it back.
 */
function translateStroke(stroke: Stroke, dx: number, dy: number): void {
	if (dx === 0 && dy === 0) return;
	const points = stroke.points;
	for (let i = 0; i + 1 < points.length; i += 3) {
		points[i] += dx;
		points[i + 1] += dy;
	}
	for (const ring of stroke.rings ?? []) {
		for (let i = 0; i + 1 < ring.length; i += 2) {
			ring[i] += dx;
			ring[i + 1] += dy;
		}
	}
}

/** Bounding box over centerlines and outline rings. */
function boundsOf(strokes: Stroke[]): {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
} {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	const visit = (x: number, y: number): void => {
		if (x < x0) x0 = x;
		if (x > x1) x1 = x;
		if (y < y0) y0 = y;
		if (y > y1) y1 = y;
	};
	for (const stroke of strokes) {
		for (let i = 0; i + 1 < stroke.points.length; i += 3) {
			visit(stroke.points[i], stroke.points[i + 1]);
		}
		for (const ring of stroke.rings ?? []) {
			for (let i = 0; i + 1 < ring.length; i += 2) visit(ring[i], ring[i + 1]);
		}
	}
	return { x0, y0, x1, y1 };
}

function toPagePoints(
	points: number[],
	pageW: number,
	pageH: number,
): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	for (let i = 0; i < points.length; i += 3) {
		out.push([points[i] * pageW, points[i + 1] * pageH]);
	}
	return out;
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

export class PdfInkController {
	readonly plugin: PdfInkPlugin;
	readonly leaf: WorkspaceLeaf;
	readonly view: any;

	doc: InkDoc | null = null;
	filePath: string | null = null;
	drawing = false;
	toolbar: PdfInkToolbar | null = null;
	history = new History(250);

	private readonly overlays = new Map<number, PageOverlay>();
	private readonly pageEls = new Map<number, HTMLElement>();
	private component: any = null;
	private pdfWrapper: any = null;
	private resolvingViewer = false;
	private hookedBus: any = null;
	private busHandlers: Array<[string, (event: any) => void]> = [];
	private domObserver: MutationObserver | null = null;
	private pageResizeObserver: ResizeObserver | null = null;
	private readonly observedPages = new Set<HTMLElement>();
	private attachTimer: number | null = null;
	private io: IntersectionObserver | null = null;
	private session: Session | null = null;
	private erased: EraseSession | null = null;
	private externalOverlay: PageOverlay | null = null;
	private activePointerId: number | null = null;
	private strokeListenersAttached = false;
	private strokeWatchdog: number | null = null;
	private zeroMoves = 0;
	private moveLogCount = 0;
	private eraserCursor: HTMLElement | null = null;
	private brushRing: HTMLElement | null = null;
	/** Clipboard lives on the plugin so it survives tab switches. */
	private get clipboard(): { strokes: Stroke[]; page: number } | null {
		return this.plugin.inkClipboard;
	}

	private set clipboard(value: { strokes: Stroke[]; page: number } | null) {
		this.plugin.inkClipboard = value;
	}
	/** overlay the user last touched; paste and menus target its page */
	private lastOverlay: PageOverlay | null = null;
	/** last pen position over a page, even while hovering */
	private hoverPoint: { overlay: PageOverlay; x: number; y: number } | null = null;
	/** set when a long, light press should select instead of erase */
	private holdSelectAt: { x: number; y: number } | null = null;
	private lastTapStrokeId: string | null = null;
	private lastTapStrokeAt = 0;
	private lastTap: { time: number; x: number; y: number } | null = null;
	/** selection mode was entered by a pen long press (temporary) */
	private selectEnteredByHold = false;
	private selectionMenu: SelectionMenu | null = null;
	private selection: {
		page: number;
		ids: Set<string>;
		frame: SelectionFrame;
	} | null = null;
	private selectSession: {
		mode: "rect" | "lasso";
		overlay: PageOverlay;
		startX: number;
		startY: number;
		points: number[];
	} | null = null;
	private moveSession: {
		overlay: PageOverlay;
		ids: string[];
		originals: Map<string, number[]>;
		ringOriginals: Map<string, number[][]>;
		startX: number;
		startY: number;
	} | null = null;
	private transformSession: TransformSession | null = null;
	/** hand tool: pointer drag scrolls the PDF viewer */
	private panSession: {
		pointerId: number;
		startX: number;
		startY: number;
		left: number;
		top: number;
		scroller: HTMLElement;
	} | null = null;
	private liveRaf = 0;
	private lastLiveAt = 0;
	/** hold-to-erase timer and the point it was armed at */
	private holdTimer: number | null = null;
	private selectHoldTimer: number | null = null;
	private holdOrigin: { x: number; y: number } | null = null;
	/** true while the current erase came from a long press, not the eraser tool */
	private pressureErasing = false;
	/** fires while the pen rests at the end of a shape-like stroke */
	private shapeHoldTimer: number | null = null;
	/** perf.now() of the last pen pointerdown, used to suppress its context menu */
	private lastPenAt = 0;
	/** Rect measured once per stroke: getBoundingClientRect on a 749-page
	 * viewer can trigger a forced layout (~40-80 ms in the perf samples). */
	private rectCache: { overlay: PageOverlay; box: DOMRect } | null = null;
	private layoutHooked = false;
	private readonly onLayoutShift = (): void => {
		this.rectCache = null;
	};
	private eraseRaf = 0;
	private renderQueued = false;
	private loadingPath: string | null = null;
	private toolbarDismissed = false;
	private altHeld = false;
	private lastNotice = 0;
	private lastSetupAt = 0;
	private destroyed = false;
	/** compat-mouse events are swallowed until this perf.now() timestamp */
	private compatShieldUntil = 0;

	/**
	 * Compatibility mouse events that follow a pen / mouse stroke.
	 *
	 * Other plugins routinely react to `mousedown` / `mouseup` / `click` on the
	 * workspace (toolbar re-layouts, selection scans, index updates…). When they
	 * do that between two pen samples they push the next `pointermove` behind
	 * 100 ms+ of unrelated work, which is exactly what "writing feels sticky"
	 * looks like. The events are already defaultPrevented by us, but plugins
	 * listening on `document` still see them, so they are stopped here — only
	 * for the stroke itself and a short tail, only over a PDF page.
	 */
	private readonly onCompatMouse = (event: Event): void => {
		if (!this.isStroking && perf.now() > this.compatShieldUntil) return;
		const target = event.target as HTMLElement | null;
		if (!target?.closest?.(".pdf-container")) return;
		event.stopPropagation();
		event.stopImmediatePropagation();
	};

	constructor(plugin: PdfInkPlugin, leaf: WorkspaceLeaf) {
		this.plugin = plugin;
		this.leaf = leaf;
		this.view = leaf.view as any;
		this.containerEl.addEventListener("pointermove", this.onHoverPointerMove);
		this.containerEl.addEventListener("pointerleave", this.hideHoverCursor);
		for (const type of ["mousedown", "mouseup", "click", "dblclick"]) {
			window.addEventListener(type, this.onCompatMouse, true);
		}
	}

	get containerEl(): HTMLElement {
		return this.view.containerEl as HTMLElement;
	}

	get viewerEl(): HTMLElement | null {
		const fromWrapper = this.pdfWrapper?.dom?.viewerEl as HTMLElement | undefined;
		if (fromWrapper?.isConnected) return fromWrapper;
		const container = this.containerEl;
		if (!container?.querySelector) return null;
		return (
			container.querySelector<HTMLElement>(".pdf-container .pdfViewer") ??
			container.querySelector<HTMLElement>(".pdfViewer") ??
			null
		);
	}

	get viewerContainerEl(): HTMLElement | null {
		const fromWrapper = this.pdfWrapper?.dom?.viewerContainerEl as
			| HTMLElement
			| undefined;
		if (fromWrapper?.isConnected) return fromWrapper;
		return (this.viewerEl?.parentElement as HTMLElement | null) ?? null;
	}

	get eventBus(): any {
		const wrapper = this.pdfWrapper;
		return wrapper?.eventBus ?? wrapper?.pdfViewer?.eventBus ?? null;
	}

	get hasViewer(): boolean {
		return Boolean(this.viewerEl);
	}

	/** Anchor for floating panels; null when the toolbar is hidden. */
	get toolbarEl(): HTMLElement | null {
		return this.toolbar?.el ?? null;
	}

	get isAlive(): boolean {
		return !this.destroyed;
	}

	/** True while a pointer session is open; used to hold off disk writes. */
	get isStroking(): boolean {
		return Boolean(
			this.session || this.erased || this.selectSession || this.moveSession || this.transformSession,
		);
	}

	/** `perf.now()` of the last finished stroke, for long-task attribution. */
	lastCommitAt = 0;

	/** Which pointer session is open, for diagnostics and tests. */
	get sessionKind(): string | null {
		if (this.session) return this.session.type;
		if (this.erased) return "erase";
		if (this.selectSession) return "select";
		if (this.moveSession) return "move";
		if (this.transformSession) return "transform";
		return null;
	}

	/**
	 * Wipes every stroke in the document (layers stay). Destructive: the caller
	 * confirms first. A `.bak` snapshot is written before anything changes.
	 */
	clearAllInk(): number {
		const doc = this.doc;
		if (!doc) return 0;
		let removed = 0;
		for (const layer of doc.layers) {
			removed += layer.strokes.length;
			layer.strokes = [];
		}
		if (removed === 0) return 0;
		this.selection = null;
		this.selectionMenu?.close();
		this.finishInteractions();
		this.history.clear();
		if (this.filePath) void this.plugin.storage.backupOnce(this.filePath);
		this.plugin.log(`cleared all ink: ${removed} strokes`);
		this.renderNow();
		this.markDirty();
		this.refreshToolbar();
		return removed;
	}

	/**
	 * Panic button: drop every half-open session so the next pen-down starts
	 * clean. Needed because a driver can cancel a pointer at a bad moment and
	 * leave the plugin convinced a stroke is still in flight.
	 */	resetInputState(): void {
		this.finishInteractions();
		this.activePointerId = null;
		this.lastTap = null;
		this.hoverPoint = null;
		this.plugin.log(`reset input state (was ${this.sessionKind ?? "idle"})`);
	}

	/**
	 * Diagnostics only: hide our ink canvases so an idle long-task count can be
	 * compared with and without them. "live" keeps the committed canvas (the
	 * ink itself) and drops only the in-progress layer, which tells us which of
	 * the two costs the compositor its time.
	 */
	setInkHidden(mode: "none" | "live" | "all"): void {
		for (const overlay of this.overlays.values()) {
			const hideLive = mode === "live" || mode === "all";
			const hideCommitted = mode === "all";
			overlay.live.setCssStyles({ display: hideLive ? "none" : "" });
			overlay.committed.setCssStyles({ display: hideCommitted ? "none" : "" });
		}
	}

	/** How many canvases we currently keep alive, for the diagnostics export. */
	get canvasCount(): number {
		return this.overlays.size * 2;
	}

	attach(retries = 80): void {
		if (this.destroyed) return;
		if (this.attachTimer !== null) {
			window.clearTimeout(this.attachTimer);
			this.attachTimer = null;
		}
		this.ensureDomObserver();
		void this.resolveViewer();
		if (!this.hasViewer) {
			this.plugin.log(`attach: no viewer element yet (retries=${retries})`);
			if (retries > 0) this.scheduleAttach(retries - 1);
			return;
		}
		this.containerEl.classList.toggle(
			"pdf-ink-pen-mode",
			this.plugin.settings.stylusFreehand,
		);
		this.ensureHooked();
		this.hookLayoutListeners();
		this.setupPages();
		void this.ensureFile();
		this.refreshToolbar();
		this.plugin.log(
			`attach retries=${retries} pages=${this.pageEls.size} overlays=${this.overlays.size} file=${
				this.view?.file?.path ?? "-"
			} doc=${Boolean(this.doc)}`,
		);
		if ((!this.doc || this.pageEls.size === 0) && retries > 0) {
			this.scheduleAttach(retries - 1);
		}
	}

	/**
	 * Obsidian 1.12 exposes the PDF viewer as `view.viewer`, a thenable
	 * component wrapper whose child holds `pdfViewer` (dom + eventBus).
	 * DOM lookup is the primary source of truth; this only adds the event bus.
	 */
	private async resolveViewer(): Promise<void> {
		if (this.pdfWrapper || this.resolvingViewer) return;
		const holder = this.view?.viewer;
		if (!holder) return;
		this.resolvingViewer = true;
		try {
			let child = holder.child ?? null;
			if (!child && typeof holder.then === "function") {
				child = await new Promise<any>((resolve) => {
					const timer = window.setTimeout(() => resolve(null), 1500);
					try {
						holder.then((value: any) => {
							window.clearTimeout(timer);
							resolve(value);
						});
					} catch {
						window.clearTimeout(timer);
						resolve(null);
					}
				});
			}
			if (!child) return;
			this.component = child;
			this.pdfWrapper = child.pdfViewer ?? null;
			this.plugin.log(
				`viewer resolved child=${Boolean(child)} wrapper=${Boolean(
					this.pdfWrapper,
				)} dom=${
					this.pdfWrapper?.dom ? Object.keys(this.pdfWrapper.dom).join(",") : "-"
				}`,
			);
			if (this.pdfWrapper) {
				this.ensureHooked();
				this.setupPages();
				this.refreshToolbar();
				void this.ensureFile();
			}
		} finally {
			this.resolvingViewer = false;
		}
	}

	private scheduleAttach(retries: number): void {
		if (retries <= 0 || this.destroyed) return;
		this.attachTimer = window.setTimeout(() => {
			this.attachTimer = null;
			this.attach(retries - 1);
		}, 150);
	}

	private ensureOverlaysAttached(): void {
		const active =
			this.externalOverlay ?? this.session?.overlay ?? this.erased?.overlay ?? null;
		for (const overlay of this.overlays.values()) {
			if (!overlay.ensureAttached()) continue;
			overlay.measure();
			overlay.render();
			// Removing/re-adding an element drops pointer capture; restore it so
			// the PDF viewer cannot steal an in-progress stroke.
			if (this.activePointerId !== null && overlay === active) {
				try {
					overlay.live.setPointerCapture(this.activePointerId);
				} catch {
					/* optional */
				}
			}
		}
	}

	private ensureDomObserver(): void {
		if (this.domObserver || typeof MutationObserver === "undefined") return;
		const container = this.containerEl;
		if (!container) return;
		this.domObserver = new MutationObserver(() => {
			if (this.destroyed) return;
			// pdf.js removes all children of a page on reset; put our canvases
			// back immediately so an in-progress stroke is not lost.
			this.ensureOverlaysAttached();
			const now = Date.now();
			if (now - this.lastSetupAt < 250) return;
			this.lastSetupAt = now;
			if (!this.hasViewer) return;
			this.setupPages();
			this.refreshToolbar();
		});
		this.domObserver.observe(container, { childList: true, subtree: true });
	}

	private ensurePageResizeObserver(): ResizeObserver | null {		if (this.pageResizeObserver) return this.pageResizeObserver;
		if (typeof ResizeObserver === "undefined") return null;
		this.pageResizeObserver = new ResizeObserver((entries) => {
			this.rectCache = null;
			for (const entry of entries) {
				const el = entry.target as HTMLElement;
				const pageNumber = Number(el.dataset.pageNumber);
				const overlay = this.overlays.get(pageNumber);
				if (overlay) {
					overlay.measure();
					overlay.render();
				}
			}
		});
		return this.pageResizeObserver;
	}

	private ensureHooked(): boolean {
		const bus = this.eventBus;
		if (!bus?.on) return false;
		if (this.hookedBus === bus) return true;
		this.unhook();
		this.hookedBus = bus;
		const onPages = () => {
			this.setupPages();
			void this.ensureFile();
		};
		const onPageRendered = (event: any) => {
			const pageNumber = Number(event?.pageNumber);
			if (!this.pageEls.has(pageNumber)) {
				this.setupPagesThrottled();
			}
			const overlay = this.overlays.get(pageNumber);
			if (overlay) {
				overlay.ensureAttached();
				overlay.measure();
				overlay.render();
			} else if (this.pageEls.has(pageNumber)) {
				this.mount(pageNumber);
			}
		};
		const onScale = () => this.scheduleDeferredRender();
		this.busHandlers = [
			["pagesloaded", onPages],
			["pagerendered", onPageRendered],
			["scalechanging", onScale],
			["pagechanging", onScale],
		];
		for (const [name, handler] of this.busHandlers) bus.on(name, handler);
		return true;
	}

	private unhook(): void {
		const bus = this.hookedBus;
		if (bus?.off) {
			for (const [name, handler] of this.busHandlers) bus.off(name, handler);
		}
		this.busHandlers = [];
		this.hookedBus = null;
	}

	private setupPages(): void {
		const viewerEl = this.viewerEl;
		if (!viewerEl) return;
		let pages = Array.from(
			viewerEl.querySelectorAll<HTMLElement>("div.page[data-page-number]"),
		);
		if (pages.length === 0) {
			// Tolerate a slightly different pdf.js DOM (class renames in a future
			// Obsidian release): any element that carries the page number and
			// contains a page canvas is good enough.
			pages = Array.from(
				viewerEl.querySelectorAll<HTMLElement>("[data-page-number]"),
			).filter((el) => {
				const n = Number(el.dataset.pageNumber);
				return Number.isFinite(n) && n >= 1 && el.querySelector(".canvasWrapper, canvas");
			});
		}
		if (pages.length === 0) {
			this.plugin.log("setupPages: no page elements found");
			return;
		}

		const next = new Map<number, HTMLElement>();
		for (const el of pages) {
			const pageNumber = Number(el.dataset.pageNumber);
			if (Number.isFinite(pageNumber) && pageNumber >= 1) {
				next.set(pageNumber, el);
			}
		}
		let changed = next.size !== this.pageEls.size;
		if (!changed) {
			for (const [pageNumber, el] of next) {
				if (this.pageEls.get(pageNumber) !== el) {
					changed = true;
					break;
				}
			}
		}
		if (!changed) {
			// Avoid re-observing hundreds of pages and forcing layout on every
			// pdf.js DOM mutation; only make sure our canvases are still there.
			this.ensureOverlaysAttached();
			return;
		}

		this.pageEls.clear();
		for (const [pageNumber, el] of next) this.pageEls.set(pageNumber, el);
		this.plugin.log(`setupPages: found=${pages.length} mapped=${this.pageEls.size}`);

		for (const [pageNumber, overlay] of [...this.overlays]) {
			const el = this.pageEls.get(pageNumber);
			if (!el || el === overlay.pageEl) continue;
			this.replaceOverlay(pageNumber, overlay, el);
		}

		this.ensureObserver();
		const observer = this.io;
		if (observer) {
			const current = new Set(this.pageEls.values());
			for (const el of [...this.observedPages]) {
				if (!current.has(el)) {
					observer.unobserve(el);
					this.observedPages.delete(el);
				}
			}
			for (const el of current) {
				if (this.observedPages.has(el)) continue;
				observer.observe(el);
				this.observedPages.add(el);
			}
		} else {
			for (const pageNumber of this.pageEls.keys()) this.mount(pageNumber);
		}
		this.mountVisible();
		this.ensureOverlaysAttached();
	}

	private setupPagesThrottled(): void {
		const now = Date.now();
		if (now - this.lastSetupAt < 300) return;
		this.lastSetupAt = now;
		this.setupPages();
	}

	private ensureObserver(): void {
		if (this.io) return;
		if (typeof IntersectionObserver === "undefined") return;
		const root = this.viewerContainerEl;
		this.io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const el = entry.target as HTMLElement;
					const pageNumber = Number(el.dataset.pageNumber);
					if (!Number.isFinite(pageNumber)) continue;
					if (entry.isIntersecting) this.mount(pageNumber);
					else if (!this.drawing) {
						const overlay = this.overlays.get(pageNumber);
						if (
							overlay &&
							(this.session?.overlay === overlay ||
								this.erased?.overlay === overlay)
						) {
							continue;
						}
						this.unmount(pageNumber);
					}
				}
			},
			{ root, rootMargin: "120% 0px" },
		);
	}

	private mount(pageNumber: number): void {
		if (this.destroyed || this.overlays.has(pageNumber)) return;
		const pageEl = this.pageEls.get(pageNumber);
		if (!pageEl) return;
		const overlay = new PageOverlay(pageEl, pageNumber);
		overlay.setDoc(this.doc);
		this.bindOverlay(overlay);
		overlay.measure();
		overlay.render();
		this.overlays.set(pageNumber, overlay);
		this.ensurePageResizeObserver()?.observe(pageEl);
		this.syncPointerTargets(false);
	}

	/** True while the plugin is the one handling page input. */
	private ownsPage(): boolean {
		return this.drawing || this.plugin.settings.stylusFreehand || Boolean(this.session || this.erased);
	}

	private bindOverlay(overlay: PageOverlay): void {
		overlay.live.addEventListener("pointerdown", (event) =>
			this.onPointerDown(event, overlay),
		);
		overlay.live.addEventListener("contextmenu", (event) => {
			// Chromium turns a longer pen/touch press into a contextmenu event,
			// which otherwise pops the editor's right-click menu mid-stroke.
			if (this.ownsPage()) {
				event.preventDefault();
				event.stopPropagation();
			}
		});
	}

	/**
	 * pdf.js may replace the whole `.page` element. Move an in-progress stroke
	 * to the new overlay instead of silently dropping it.
	 */
	private replaceOverlay(
		pageNumber: number,
		oldOverlay: PageOverlay,
		pageEl: HTMLElement,
	): void {
		const active =
			this.session?.overlay === oldOverlay ||
			this.erased?.overlay === oldOverlay;
		const overlay = new PageOverlay(pageEl, pageNumber);
		overlay.setDoc(this.doc);
		this.bindOverlay(overlay);
		this.overlays.set(pageNumber, overlay);
		if (active) {
			if (this.session?.overlay === oldOverlay) this.session.overlay = overlay;
			if (this.erased?.overlay === oldOverlay) this.erased.overlay = overlay;
			if (this.externalOverlay === oldOverlay) this.externalOverlay = overlay;
		}
		try {
			this.pageResizeObserver?.unobserve(oldOverlay.pageEl);
		} catch {
			/* already gone */
		}
		oldOverlay.destroy();
		this.ensurePageResizeObserver()?.observe(pageEl);
		overlay.measure();
		overlay.render();
		if (active && this.activePointerId !== null) {
			try {
				overlay.live.setPointerCapture(this.activePointerId);
			} catch {
				/* optional */
			}
		}
		this.plugin.log(`replaceOverlay page=${pageNumber} active=${active}`);
	}

	private unmount(pageNumber: number): void {
		const overlay = this.overlays.get(pageNumber);
		if (!overlay) return;
		if (this.session?.overlay === overlay) this.session = null;
		if (this.erased?.overlay === overlay) this.erased = null;
		try {
			this.pageResizeObserver?.unobserve(overlay.pageEl);
		} catch {
			/* already gone */
		}
		overlay.destroy();
		this.overlays.delete(pageNumber);
	}

	mountVisible(): void {
		if (typeof window === "undefined") return;
		const viewportHeight =
			this.viewerContainerEl?.clientHeight || window.innerHeight;
		for (const [pageNumber, el] of this.pageEls) {
			const rect = el.getBoundingClientRect();
			if (rect.bottom > -viewportHeight && rect.top < viewportHeight * 2) {
				this.mount(pageNumber);
			}
		}
	}

	async ensureFile(): Promise<void> {
		const file = (this.view?.file ?? this.component?.file) as TFile | undefined;
		if (!file || file.extension !== "pdf") {
			this.plugin.log(
				`ensureFile: no pdf file yet file=${String(this.view?.file?.path ?? "-")}`,
			);
			return;
		}
		if (this.loadingPath === file.path) return;
		if (this.filePath === file.path && this.doc) return;
		this.plugin.log(`ensureFile: start ${file.path}`);

		this.loadingPath = file.path;
		this.filePath = file.path;
		this.history.clear();
		this.doc = null;
		this.renderNow();
		this.refreshToolbar();
		this.notify();

		let doc: InkDoc | null = null;
		try {
			doc = await this.plugin.storage.load(file.path);
		} finally {
			if (this.loadingPath === file.path) this.loadingPath = null;
		}
		if (this.destroyed || this.filePath !== file.path) return;
		if (!doc) doc = createDoc(file.path);
		this.doc = doc;
		this.plugin.log(
			`ensureFile: loaded ${file.path} layers=${doc.layers.length}`,
		);
		// Legacy eraser masks (dev.20 and earlier) are deleted outright: the
		// user asked for removal, not migration — keeping them around only made
		// the sidecar bigger and left ink that "comes back" when a stroke moves.
		this.purgeLegacyEraserMasks();
		this.renderNow();
		this.refreshToolbar();
		this.notify();
	}

	/**
	 * Drops every stored eraser mask. Their ink was "erased" by drawing on top
	 * of it, so removing the mask means that ink shows again — which is exactly
	 * what the user asked for. One `.bak` is written before the first purge.
	 */
	private purgeLegacyEraserMasks(): number {
		const doc = this.doc;
		if (!doc) return 0;
		let removed = 0;
		for (const layer of doc.layers) {
			const before = layer.strokes.length;
			layer.strokes = layer.strokes.filter((stroke) => {
				if (!stroke.kind.startsWith("eraser")) return true;
				removed++;
				return false;
			});
			if (layer.strokes.length !== before) {
				// Arrays are replaced, so any cached page render is stale.
			}
		}
		if (removed === 0) return 0;
		this.plugin.log(`purged ${removed} legacy eraser masks`);
		if (this.filePath) void this.plugin.storage.backupOnce(this.filePath);
		this.history.clear();
		this.markDirty();
		return removed;
	}

	onVaultRename(oldPath: string, newPath: string): void {
		if (this.filePath !== oldPath) return;
		this.filePath = newPath;
		if (this.doc) this.doc.file = newPath;
		this.notify();
	}

	/** Switching tools must drop the selection: its dashed box is tool UI. */
	onToolChanged(): void {
		this.selectionMenu?.close();
		if (this.plugin.tool !== "select") this.selectEnteredByHold = false;
		if (this.plugin.tool === "select") return;
		this.clearSelection();
	}

	setDrawing(on: boolean): void {
		if (this.destroyed) return;
		if (on) {
			this.toolbarDismissed = false;
			this.attach();
			void this.ensureFile();
		}
		this.drawing = on;
		this.containerEl.classList.toggle("pdf-ink-drawing", on);
		this.containerEl.classList.toggle(
			"pdf-ink-pen-mode",
			this.plugin.settings.stylusFreehand,
		);
		if (on) {
			this.setupPages();
			this.mountVisible();
		} else {
			this.finishInteractions();
		}
		// Drawing mode also decides whether the live canvas takes pointer events
		// (see syncPointerTargets) — applied inline, never via a global class.
		this.syncPointerTargets(false);
		this.refreshToolbar();
		this.plugin.emitter.trigger("pdf-ink:active-changed");
		this.notify();
	}

	toggleDrawing(): void {
		this.setDrawing(!this.drawing);
	}

	dismissToolbar(): void {
		this.toolbarDismissed = true;
		this.setDrawing(false);
	}

	refreshToolbar(): void {
		this.containerEl.classList.toggle("pdf-ink-tool-hand", this.plugin.tool === "hand");
		this.applyAltPassthrough();
		this.containerEl.classList.toggle(
			"pdf-ink-pen-mode",
			this.plugin.settings.stylusFreehand || this.plugin.settings.mouseFreehand,
		);
		// The disc only makes sense for the freehand eraser; rect / lasso erase
		// use the crosshair like the selection tools do.
		if (!this.eraserDiscVisible()) this.hideEraserCursor();
		if (this.plugin.tool !== "pen" && this.plugin.tool !== "highlighter") {
			this.hideBrushRing();
			this.containerEl.classList.remove("pdf-ink-cursor-point", "pdf-ink-cursor-ring");
		}
		const wanted =
			Boolean(this.viewerEl) &&
			!this.toolbarDismissed &&
			(this.drawing || this.plugin.settings.showToolbarAlways);
		if (wanted) {
			if (!this.toolbar) this.toolbar = new PdfInkToolbar(this.plugin, this);
			else this.toolbar.update();
		} else if (this.toolbar) {
			this.toolbar.destroy();
			this.toolbar = null;
		}
	}

	/* ------------------------------------------------------------------ */
	/* Input                                                               */
	/* ------------------------------------------------------------------ */

	private pointFor(
		event: PointerEvent,
		overlay: PageOverlay,
		rect?: { left: number; top: number; width: number; height: number },
	): PagePoint | null {
		const box = rect ?? this.rectFor(overlay);
		if (!box || box.width < 2 || box.height < 2) return null;
		const x = (event.clientX - box.left) / box.width;
		const y = (event.clientY - box.top) / box.height;
		if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
		const pressure =
			event.pointerType === "pen" && Number.isFinite(event.pressure)
				? clamp(event.pressure, 0, 1)
				: 0.5;
		return { x: clamp(x, 0, 1), y: clamp(y, 0, 1), p: pressure };
	}

	private rectFor(overlay: PageOverlay, refresh = false): DOMRect {
		if (!refresh && this.rectCache && this.rectCache.overlay === overlay) {
			return this.rectCache.box;
		}
		const box = overlay.live.getBoundingClientRect();
		this.rectCache = { overlay, box };
		return box;
	}

	private onPointerDown(event: PointerEvent, overlay: PageOverlay): void {
		if (!this.drawing || !this.doc) return;
		// Touching the page always dismisses the floating UI, whatever the tool
		// and whatever the button — otherwise it needs a second click.
		this.toolbar?.closePopovers();
		// Just after a hold gesture was released: the driver may claim the tip
		// is up while it is still moving, so no new stroke may start yet.
		if (this.plugin.strokeBlocked()) {
			this.plugin.log("stroke blocked in drawing mode (hold release guard)");
			return;
		}
		// Shift is the brush-resize gesture for ink tools; drawing with it held
		// would paint a stroke every time the brush is resized.
		if (
			event.shiftKey &&
			(this.plugin.tool === "pen" || this.plugin.tool === "highlighter")
		) {
			return;
		}
		this.selectionMenu?.close();
		if (this.plugin.tool !== "select") this.clearSelection();
		if (this.session || this.erased) this.finishInteractions();
		if (event.altKey) return;
		if (event.button !== 0) return;
		const rect = this.rectFor(overlay, true);
		if (rect.width < 2 || rect.height < 2) return;
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
		const downPoint = this.pointFor(event, overlay, rect);
		if (downPoint && this.maybeDoubleTap(overlay, event, downPoint, rect)) {
			this.activePointerId = null;
			this.setStroking(false);
			return;
		}
		this.plugin.log(
			`down id=${event.pointerId} type=${event.pointerType} b=${event.buttons} p=${Number(
				event.pressure ?? 0,
			).toFixed(2)}`,
		);
		this.toolbar?.closePopovers();
		this.lastOverlay = overlay;
		this.activePointerId = event.pointerId;
		if (event.pointerType === "pen") this.lastPenAt = perf.now();
		// Frame gaps are only meaningful inside one stroke; resetting here keeps
		// idle time between strokes out of the average.
		this.lastLiveAt = 0;
		try {
			overlay.live.setPointerCapture(event.pointerId);
		} catch {
			/* pointer capture is best effort */
		}
		this.beginToolAt(overlay, event);
		if (
			this.session ||
			this.erased ||
			this.selectSession ||
			this.moveSession ||
			this.transformSession
		) {
			this.attachStrokeListeners();
		}
	}

	/**
	 * Entry point for "pen draws without entering draw mode". Called from the
	 * document level capture listener installed by the plugin.
	 */
	beginExternalStroke(event: PointerEvent, pageEl: HTMLElement): boolean {
		if (this.destroyed) return false;
		// The window-capture handler swallows the event before it can bubble to
		// the document, so popovers cannot rely on their own "click outside"
		// listener here — close them explicitly.
		this.toolbar?.closePopovers();
		// A pen-up event is not guaranteed from every tablet driver. A new
		// pointerdown always finalizes the previous stroke instead of being
		// swallowed by a stale session.
		if (this.session || this.erased) this.finishInteractions();
		const pageNumber = Number(pageEl.dataset.pageNumber);
		if (!Number.isFinite(pageNumber)) return false;
		if (!this.doc) {
			this.plugin.log(
				`external: doc not ready file=${this.view?.file?.path ?? "-"} pages=${this.pageEls.size}`,
			);
			void this.ensureFile().then(() => {
				this.notice("批注正在加载，请再写一次");
			});
			this.plugin.dumpDiagnostics("doc-not-ready");
			return false;
		}
		if (!this.pageEls.has(pageNumber)) this.setupPages();
		this.mount(pageNumber);
		const overlay = this.overlays.get(pageNumber);
		if (!overlay) {
			this.plugin.log(
				`external: no overlay page=${pageNumber} pageEls=${this.pageEls.size} viewer=${this.hasViewer}`,
			);
			this.plugin.dumpDiagnostics("no-overlay");
			return false;
		}
		overlay.ensureAttached();
		overlay.measure();
		this.rectFor(overlay, true);
		this.lastLiveAt = 0;
		try {
			overlay.live.setPointerCapture(event.pointerId);
		} catch {
			/* best effort, window listeners still guard the stroke */
		}
		this.selectionMenu?.close();
		const externalPoint = this.pointFor(event, overlay, this.rectFor(overlay));
		if (
			externalPoint &&
			this.maybeDoubleTap(overlay, event, externalPoint, this.rectFor(overlay))
		) {
			return true;
		}
		this.externalOverlay = overlay;
		this.toolbar?.closePopovers();
		this.activePointerId = event.pointerId;
		if (event.pointerType === "pen") this.lastPenAt = perf.now();
		this.plugin.log(
			`external down id=${event.pointerId} type=${event.pointerType} b=${event.buttons} p=${Number(
				event.pressure ?? 0,
			).toFixed(2)}`,
		);
		this.beginToolAt(overlay, event);
		if (this.session || this.erased || this.selectSession || this.moveSession || this.transformSession || this.panSession) {
			this.attachStrokeListeners();
			return true;
		}
		this.externalOverlay = null;
		this.activePointerId = null;
		return false;
	}

	private attachStrokeListeners(): void {
		if (this.strokeListenersAttached) return;
		this.strokeListenersAttached = true;
		this.zeroMoves = 0;
		this.moveLogCount = 0;
		window.addEventListener("pointermove", this.onStrokePointerMove, true);
		window.addEventListener("pointerup", this.onStrokePointerUp, true);
		window.addEventListener("pointercancel", this.onStrokePointerUp, true);
		window.addEventListener("lostpointercapture", this.onLostPointerCapture, true);
		this.resetStrokeWatchdog();
	}

	private detachStrokeListeners(): void {
		if (this.strokeWatchdog !== null) {
			window.clearTimeout(this.strokeWatchdog);
			this.strokeWatchdog = null;
		}
		if (this.strokeListenersAttached) {
			this.strokeListenersAttached = false;
			window.removeEventListener("pointermove", this.onStrokePointerMove, true);
			window.removeEventListener("pointerup", this.onStrokePointerUp, true);
			window.removeEventListener("pointercancel", this.onStrokePointerUp, true);
			window.removeEventListener("lostpointercapture", this.onLostPointerCapture, true);
		}
		this.externalOverlay = null;
		this.activePointerId = null;
	}

	private resetStrokeWatchdog(): void {
		if (this.strokeWatchdog !== null) window.clearTimeout(this.strokeWatchdog);
		this.strokeWatchdog = window.setTimeout(() => {
			this.strokeWatchdog = null;
			if (
				!this.session &&
				!this.erased &&
				!this.selectSession &&
				!this.moveSession &&
				!this.transformSession
			) {
				return;
			}
			this.plugin.log("watchdog: committing stalled stroke");
			if (this.session) this.finishSession();
			if (this.erased) this.finishErase();
			if (this.selectSession) this.finishSelection();
			if (this.moveSession) this.finishMoveSelection();
			if (this.transformSession) this.finishTransform();
			this.setStroking(false);
			this.detachStrokeListeners();
		}, 2000);
	}

	private readonly onStrokePointerMove = (event: PointerEvent): void => {
		const overlay =
			this.session?.overlay ??
			this.erased?.overlay ??
			this.selectSession?.overlay ??
			this.moveSession?.overlay ??
			this.transformSession?.overlay;
		if (!overlay) return;
		if (this.activePointerId !== null && event.pointerId !== this.activePointerId) {
			return;
		}
		if (this.selectSession || this.moveSession || this.transformSession) {
			this.resetStrokeWatchdog();
			this.onPointerMove(event, overlay);
			return;
		}
		this.moveLogCount++;
		if (this.moveLogCount <= 20 || this.moveLogCount % 15 === 0) {
			this.plugin.log(
				`move#${this.moveLogCount} id=${event.pointerId} type=${
					event.pointerType
				} b=${event.buttons} p=${Number(event.pressure ?? 0).toFixed(2)}`,
			);
		}
		const zeroPressure = (event.pressure ?? 0) <= 0.001;
		const hovering =
			event.pointerType === "pen"
				? event.buttons === 0 && zeroPressure
				: event.buttons === 0;
		if (hovering) {
			this.zeroMoves++;
			// A single spurious buttons=0 event happens on some tablets while
			// the pen is still in contact; only end after a few in a row.
			if (this.zeroMoves >= 3) {
				this.plugin.log(
					`stroke end on hover type=${event.pointerType} buttons=${event.buttons} pressure=${event.pressure}`,
				);
				this.onPointerUp(event, overlay);
				this.detachStrokeListeners();
				this.setStroking(false);
			}
			return;
		}
		this.zeroMoves = 0;
		this.resetStrokeWatchdog();
		this.onPointerMove(event, overlay);
	};

	private readonly onStrokePointerUp = (event: PointerEvent): void => {
		const overlay =
			this.session?.overlay ??
			this.erased?.overlay ??
			this.selectSession?.overlay ??
			this.moveSession?.overlay ??
			this.transformSession?.overlay;
		if (!overlay) {
			this.detachStrokeListeners();
			return;
		}
		if (this.activePointerId !== null && event.pointerId !== this.activePointerId) {
			return;
		}
		if (event.type === "pointercancel" && event.pointerType !== "touch") {
			// Chrome fires pointercancel when the captured canvas is removed by
			// pdf.js page rendering. Keep the stroke alive; hovering/pen-up
			// filtering above (or the watchdog) will end it.
			this.plugin.log(
				`pointercancel ignored type=${event.pointerType} b=${event.buttons} p=${event.pressure}`,
			);
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
		this.onPointerUp(event, overlay);
		this.detachStrokeListeners();
	};

	private readonly onLostPointerCapture = (): void => {
		const overlay = this.session?.overlay ?? this.erased?.overlay;
		if (!overlay || this.activePointerId === null) return;
		try {
			overlay.live.setPointerCapture(this.activePointerId);
		} catch {
			/* canvas may be temporarily detached */
		}
	};

	private beginToolAt(overlay: PageOverlay, event: PointerEvent): void {
		const tool = this.plugin.tool;
		if (tool === "hand") {
			this.beginPan(event);
			return;
		}
		if (tool === "select") {
			this.beginSelection(overlay, event);
		} else if (tool === "eraser") {
			const { eraserRegion, eraserScope } = this.plugin.settings;
			if (eraserRegion === "free") {
				if (eraserScope === "whole") this.beginStrokeErase(overlay, event);
				else this.beginErase(overlay, event);
			} else if (eraserRegion === "rect") {
				this.beginRectErase(overlay, event);
			} else {
				this.beginLassoErase(overlay, event);
			}
		} else if (SHAPE_TOOLS.includes(tool as ShapeKind)) {
			this.beginShape(overlay, event, tool as ShapeKind);
		} else {
			this.beginFreehand(overlay, event, tool === "highlighter" ? "highlighter" : "pen");
		}
	}

	private beginFreehand(
		overlay: PageOverlay,
		event: PointerEvent,
		tool: "pen" | "highlighter",
	): void {
		const layer = this.getWritableLayer();
		if (!layer) return;
		const point = this.pointFor(event, overlay);
		if (!point) return;
		const brush = this.plugin.brushFor(tool);
		// Tablets often report ~0 pressure on the very first sample; using it
		// verbatim makes the landing point razor thin ("ink missing at the tip").
		const landing = point.p < 0.15 ? 0.5 : point.p;
		const stroke: Stroke = {
			id: uid("s"),
			kind: tool,
			page: overlay.pageNumber,
			color: brush.color,
			width: brush.widthPx / REFERENCE_PAGE_WIDTH,
			opacity: brush.opacity,
			points: [point.x, point.y, landing],
		};
		this.session = {
			type: "freehand",
			overlay,
			layerId: layer.id,
			layerOpacity: layer.opacity,
			stroke,
			lastX: point.x,
			lastY: point.y,
			lastPressure: point.p,
			lastPointAt: perf.now(),
		};
		this.plugin.log(
			`stroke start kind=${tool} page=${overlay.pageNumber} size=${overlay.widthPx}x${overlay.heightPx}`,
		);
		this.setStroking(true);
		overlay.beginLive(stroke, layer.opacity);
		this.armHoldErase(overlay, event, point);
	}

	/**
	 * Hold-to-erase: the ink is drawn immediately, and only if the pen rests
	 * (and presses hard enough) do we roll that bit back and start erasing.
	 * That keeps handwriting latency untouched.
	 */
	private armHoldErase(overlay: PageOverlay, event: PointerEvent, point: PagePoint): void {
		this.cancelHoldErase();
		const settings = this.plugin.settings;
		if (!settings.eraserHoldEnabled) return;
		if (event.pointerType !== "pen") return;
		this.holdOrigin = { x: point.x, y: point.y };
		const startedAt = perf.now();
		const holdMs = Math.max(120, settings.eraserHoldMs);
		const windowMs = Math.max(holdMs, settings.eraserHoldWindowMs);
		let streak = 0;
		// Keep listening inside the window: pressing harder a moment later must
		// still switch to erasing, which a one-shot timer at `holdMs` missed.
		const tick = () => {
			this.holdTimer = null;
			const session = this.session;
			if (!session || session.type !== "freehand" || session.overlay !== overlay) return;
			const elapsed = perf.now() - startedAt;
			if (elapsed >= holdMs) {
				if (session.lastPressure >= settings.eraserHoldPressure) {
					streak += 1;
					if (streak >= 2) {
						this.startPressureErase(session);
						return;
					}
				} else {
					streak = 0;
					// Light press on a still pen switches tools right away; waiting
					// for pen-up made it feel like the long press did nothing.
					this.holdSelectAt = null;
					this.holdOrigin = null;
					if (this.holdTimer !== null) {
						window.clearTimeout(this.holdTimer);
						this.holdTimer = null;
					}
					this.discardSession();
					this.activePointerId = null;
					this.setStroking(false);
					this.plugin.log("pen long press -> select tool");
					this.selectEnteredByHold = true;
					this.plugin.setTool("select");
					// Continue the same touch as a rubber band so the user can box
					// select without lifting the pen.
					this.beginSelection(overlay, event, false);
					return;
				}
			}
			if (elapsed >= windowMs) return;
			this.holdTimer = window.setTimeout(tick, HOLD_POLL_MS);
		};
		this.holdTimer = window.setTimeout(tick, holdMs);
	}

	private cancelHoldErase(): void {
		if (this.holdTimer !== null) {
			window.clearTimeout(this.holdTimer);
			this.holdTimer = null;
		}
		this.holdOrigin = null;
	}

	/**
	 * Auto shape recognition fires while the pen is still resting, not only on
	 * lift — otherwise the user has to hold for seconds before it converts.
	 * It only commits when the stroke actually looks like a shape, so pausing
	 * in the middle of handwriting never cuts the stroke.
	 */
	private shapeHoldArmedAt = 0;

	private armShapeHold(session: FreehandSession): void {
		const settings = this.plugin.settings;
		if (!settings.autoShapeEnabled || settings.autoShapeTrigger !== "hold") return;
		// Re-arming on every single sample hammered the timer queue while
		// writing fast; a 120 ms throttle is still far below the hold delay.
		const now = perf.now();
		if (now - this.shapeHoldArmedAt < 120) return;
		this.shapeHoldArmedAt = now;
		if (this.shapeHoldTimer !== null) window.clearTimeout(this.shapeHoldTimer);
		const delay = Math.max(200, settings.autoShapeHoldMs);
		this.shapeHoldTimer = window.setTimeout(() => {
			this.shapeHoldTimer = null;
			if (this.session !== session) return;
			if (perf.now() - session.lastPointAt < delay - 30) return;
			const rect = this.rectFor(session.overlay);
			if (rect.width < 10 || rect.height < 10) return;
			const points = session.stroke.points;
			// Cheap rejects first: recognition is pure CPU work on the hot path.
			if (points.length < 12) return;
			if (!recognizeStroke(points, rect.width, rect.height)) return;
			perf.count("shape.early");
			this.plugin.log("shape hold: committing early");
			this.finishSession();
		}, delay);
	}

	private cancelShapeHold(): void {
		if (this.shapeHoldTimer !== null) {
			window.clearTimeout(this.shapeHoldTimer);
			this.shapeHoldTimer = null;
		}
	}

	private startPressureErase(session: FreehandSession): void {
		const layer = this.doc ? findLayer(this.doc, session.layerId) : null;
		if (!layer) return;
		// Drop the ink drawn during the hold window; it was never committed.
		session.overlay.clearLive();
		this.session = null;
		this.pressureErasing = true;
		const rect = this.rectFor(session.overlay);
		this.showEraserCursorAt(
			rect.left + session.lastX * rect.width,
			rect.top + session.lastY * rect.height,
			session.overlay,
			session.lastPressure,
		);
		this.plugin.log(`hold erase start page=${session.overlay.pageNumber}`);
		this.beginEraseAt(
			session.overlay,
			session.lastX,
			session.lastY,
			session.lastPressure,
			layer,
		);
	}

	private beginShape(
		overlay: PageOverlay,
		event: PointerEvent,
		kind: ShapeKind,
	): void {
		const layer = this.getWritableLayer();
		if (!layer) return;
		const point = this.pointFor(event, overlay);
		if (!point) return;
		const brush = this.plugin.brushFor("pen");
		const stroke: Stroke = {
			id: uid("s"),
			kind,
			page: overlay.pageNumber,
			color: brush.color,
			width: brush.widthPx / REFERENCE_PAGE_WIDTH,
			opacity: brush.opacity,
			points: [point.x, point.y, 0.5, point.x, point.y, 0.5],
		};
		this.session = {
			type: "shape",
			overlay,
			layerId: layer.id,
			layerOpacity: layer.opacity,
			stroke,
			startX: point.x,
			startY: point.y,
		};
		this.plugin.log(
			`shape start kind=${kind} page=${overlay.pageNumber} size=${overlay.widthPx}x${overlay.heightPx}`,
		);
		this.setStroking(true);
		overlay.drawLive(stroke, layer.opacity);
	}

	private beginRectErase(overlay: PageOverlay, event: PointerEvent): void {
		const layer = this.getWritableLayer();
		if (!layer) return;
		const point = this.pointFor(event, overlay);
		if (!point) return;
		const stroke: Stroke = {
			id: uid("s"),
			kind: "eraser-rect",
			page: overlay.pageNumber,
			color: "#000000",
			width: this.plugin.settings.eraserWidth / REFERENCE_PAGE_WIDTH,
			opacity: 1,
			points: [point.x, point.y, 0.5, point.x, point.y, 0.5],
		};
		this.session = {
			type: "shape",
			overlay,
			layerId: layer.id,
			layerOpacity: layer.opacity,
			stroke,
			startX: point.x,
			startY: point.y,
		};
		this.plugin.log(`rect erase start page=${overlay.pageNumber}`);
		this.setStroking(true);
		overlay.drawGuideOnly({
			kind: "rect",
			x0: point.x,
			y0: point.y,
			x1: point.x,
			y1: point.y,
		});
	}

	private beginLassoErase(overlay: PageOverlay, event: PointerEvent): void {
		const layer = this.getWritableLayer();
		if (!layer) return;
		const point = this.pointFor(event, overlay);
		if (!point) return;
		const stroke: Stroke = {
			id: uid("s"),
			kind: "eraser-lasso",
			page: overlay.pageNumber,
			color: "#000000",
			width: this.plugin.settings.eraserWidth / REFERENCE_PAGE_WIDTH,
			opacity: 1,
			points: [point.x, point.y, 0.5],
		};
		this.session = {
			type: "freehand",
			overlay,
			layerId: layer.id,
			layerOpacity: layer.opacity,
			stroke,
			lastX: point.x,
			lastY: point.y,
			lastPressure: point.p,
			lastPointAt: perf.now(),
		};
		this.plugin.log(`lasso erase start page=${overlay.pageNumber}`);
		this.setStroking(true);
		overlay.drawFreehandGuide(stroke);
	}

	/* ------------------------------------------------------------------ */
	/* Hand tool (pan)                                                     */
	/* ------------------------------------------------------------------ */

	private beginPan(event: PointerEvent): void {
		const scroller = this.viewerContainerEl;
		if (!scroller) return;
		this.panSession = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			left: scroller.scrollLeft,
			top: scroller.scrollTop,
			scroller,
		};
		this.containerEl.classList.add("pdf-ink-panning");
		window.addEventListener("pointermove", this.onPanMove, true);
		window.addEventListener("pointerup", this.onPanEnd, true);
		window.addEventListener("pointercancel", this.onPanEnd, true);
	}

	private readonly onPanMove = (event: PointerEvent): void => {
		const pan = this.panSession;
		if (!pan || event.pointerId !== pan.pointerId) return;
		event.preventDefault();
		pan.scroller.scrollLeft = pan.left - (event.clientX - pan.startX);
		pan.scroller.scrollTop = pan.top - (event.clientY - pan.startY);
	};

	private readonly onPanEnd = (event: PointerEvent): void => {
		const pan = this.panSession;
		if (!pan || event.pointerId !== pan.pointerId) return;
		this.panSession = null;
		this.containerEl.classList.remove("pdf-ink-panning");
		window.removeEventListener("pointermove", this.onPanMove, true);
		window.removeEventListener("pointerup", this.onPanEnd, true);
		window.removeEventListener("pointercancel", this.onPanEnd, true);
	};

	private beginSelection(overlay: PageOverlay, event: PointerEvent, armHold = true): void {
		const point = this.pointFor(event, overlay);
		if (!point) return;
		const handle = this.selectionHandleAt(overlay, point.x, point.y);
		if (handle) {
			this.beginTransform(overlay, point, handle);
			return;
		}
		if (
			this.selection &&
			this.selection.page === overlay.pageNumber &&
			this.selectionContains(overlay, point.x, point.y)
		) {
			const strokes = this.collectSelectedStrokes();
			if (strokes.length > 0) {
				this.moveSession = {
					overlay,
					ids: strokes.map((stroke) => stroke.id),
					originals: new Map(
						strokes.map((stroke) => [stroke.id, stroke.points.slice()]),
					),
					ringOriginals: new Map(
						strokes
							.filter((stroke) => stroke.rings)
							.map((stroke) => [
								stroke.id,
								(stroke.rings ?? []).map((ring) => ring.slice()),
							]),
					),
					startX: point.x,
					startY: point.y,
				};
				this.setStroking(true);
				return;
			}
		}
		this.clearSelection();
		const mode = this.plugin.settings.selectMode;
		this.selectSession = {
			mode,
			overlay,
			startX: point.x,
			startY: point.y,
			points: [point.x, point.y, 0.5],
		};
		this.setStroking(true);
		if (mode === "rect") {
			overlay.drawGuideOnly({
				kind: "rect",
				x0: point.x,
				y0: point.y,
				x1: point.x,
				y1: point.y,
			});
		} else {
			overlay.drawFreehandGuide(this.makeGuideStroke(overlay.pageNumber, [point.x, point.y, 0.5]));
		}
		if (armHold) this.armSelectHold(overlay, point, event.clientX, event.clientY);
	}

	/** Long press in the selection tool opens the menu on the stroke below. */
	private armSelectHold(
		overlay: PageOverlay,
		point: PagePoint,
		clientX: number,
		clientY: number,
	): void {
		this.cancelSelectHold();
		// Touch-oriented gesture; pen tablets turn it off (settings → 手势) and
		// use the stroke menu's keyboard actions instead.
		if (!this.plugin.settings.tapGestureMenuEnabled) return;
		const delay = Math.max(350, this.plugin.settings.eraserHoldMs);
		this.selectHoldTimer = window.setTimeout(() => {
			this.selectHoldTimer = null;
			const session = this.selectSession;
			if (!session || session.overlay !== overlay) return;
			const rect = this.rectFor(overlay);
			const pts = session.points;
			const moved =
				pts.length > 6 ||
				(pts.length >= 6 &&
					(Math.abs(pts[3] - pts[0]) * rect.width > 8 ||
						Math.abs(pts[4] - pts[1]) * rect.height > 8));
			if (moved) return;
			this.selectSession = null;
			overlay.clearLive();
			this.setStroking(false);
			if (this.selectStrokeAt(overlay, point.x, point.y)) {
				this.plugin.log("hold select (selection tool)");
				this.openSelectionMenu(clientX, clientY);
			} else {
				this.renderSelection();
			}
		}, delay);
	}

	private cancelSelectHold(): void {
		if (this.selectHoldTimer !== null) {
			window.clearTimeout(this.selectHoldTimer);
			this.selectHoldTimer = null;
		}
	}

	private makeGuideStroke(page: number, points: number[]): Stroke {
		return {
			id: "selection-guide",
			kind: "pen",
			page,
			color: "#4c8cff",
			width: 0.0001,
			opacity: 1,
			points,
		};
	}

	private updateSelection(event: PointerEvent, overlay: PageOverlay): void {
		if (this.transformSession) {
			this.updateTransform(event, overlay);
			return;
		}
		if (this.selectSession) {
			const session = this.selectSession;
			const rect = this.rectFor(overlay);
			const point = this.pointFor(event, overlay, rect);
			if (!point) return;
			if (session.mode === "rect") {
				session.points = [
					session.startX,
					session.startY,
					0.5,
					point.x,
					point.y,
					0.5,
				];
				overlay.drawGuideOnly({
					kind: "rect",
					x0: session.startX,
					y0: session.startY,
					x1: point.x,
					y1: point.y,
				});
			} else {
				const lastX = session.points[session.points.length - 3];
				const lastY = session.points[session.points.length - 2];
				const dx = (point.x - lastX) * rect.width;
				const dy = (point.y - lastY) * rect.height;
				if (dx * dx + dy * dy > 2) {
					session.points.push(point.x, point.y, 0.5);
					overlay.drawFreehandGuide(
						this.makeGuideStroke(overlay.pageNumber, session.points),
					);
				}
			}
			return;
		}
		const move = this.moveSession;
		if (!move) return;
		const rect = this.rectFor(overlay);
		const point = this.pointFor(event, overlay, rect);
		if (!point) return;
		const dx = point.x - move.startX;
		const dy = point.y - move.startY;
		const done = perf.start("selection.move");
		for (const id of move.ids) {
			const stroke = this.findStrokeById(id);
			const original = move.originals.get(id);
			if (!stroke || !original) continue;
			const ringOrigin = move.ringOriginals.get(id);
			if (ringOrigin && stroke.rings) {
				stroke.rings = ringOrigin.map((ring) => {
					const moved = ring.slice();
					for (let i = 0; i + 1 < moved.length; i += 2) {
						moved[i] = ring[i] + dx;
						moved[i + 1] = ring[i + 1] + dy;
					}
					return moved;
				});
			} else if (ringOrigin) {
				stroke.rings = ringOrigin.map((ring) => ring.slice());
			}
			for (let i = 0; i < stroke.points.length; i += 3) {
				stroke.points[i] = original[i] + dx;
				stroke.points[i + 1] = original[i + 1] + dy;
			}
		}
		overlay.render();
		this.refreshSelectionFrame();
		this.renderSelection();
		done();
	}

	private finishSelection(): void {
		this.cancelSelectHold();
		const session = this.selectSession;
		this.selectSession = null;
		if (!session) return;
		session.overlay.clearLive();
		const doc = this.doc;
		const layer = doc ? getActiveLayer(doc) : null;
		const page = session.overlay.pageNumber;
		const points = session.points;
		const rect = {
			x0: Math.min(points[0], points[3] ?? points[0]),
			y0: Math.min(points[1], points[4] ?? points[1]),
			x1: Math.max(points[0], points[3] ?? points[0]),
			y1: Math.max(points[1], points[4] ?? points[1]),
		};
		const polygon: Array<[number, number]> = [];
		for (let i = 0; i < points.length / 3; i++) {
			polygon.push([points[i * 3], points[i * 3 + 1]]);
		}
		// A tap (no drag) picks the stroke under the tip instead of running a
		// zero-size rubber band against bounding boxes.
		if (
			session.mode === "rect" &&
			Math.abs(rect.x1 - rect.x0) * (session.overlay.widthPx || 1) < 6 &&
			Math.abs(rect.y1 - rect.y0) * (session.overlay.heightPx || 1) < 6
		) {
			this.selectStrokeAt(session.overlay, rect.x0, rect.y0);
			this.setStroking(false);
			return;
		}
		const ids = new Set<string>();
		let x0 = Infinity;
		let y0 = Infinity;
		let x1 = -Infinity;
		let y1 = -Infinity;
		if (layer) {
			for (const stroke of layer.strokes) {
				if (stroke.page !== page) continue;
				if (
					stroke.kind === "eraser" ||
					stroke.kind === "eraser-rect" ||
					stroke.kind === "eraser-lasso"
				) {
					continue;
				}
				const bbox = this.strokeBounds(stroke);
				const hit =
					session.mode === "rect"
						? bbox.x0 <= rect.x1 &&
							bbox.x1 >= rect.x0 &&
							bbox.y0 <= rect.y1 &&
							bbox.y1 >= rect.y0
						: this.anyPointInPolygon(
								stroke.points,
								polygon,
								stroke.rings,
							);
				if (!hit) continue;
				ids.add(stroke.id);
				x0 = Math.min(x0, bbox.x0);
				y0 = Math.min(y0, bbox.y0);
				x1 = Math.max(x1, bbox.x1);
				y1 = Math.max(y1, bbox.y1);
			}
		}
		if (ids.size > 0) {
			this.selection = {
				page,
				ids,
				frame: this.frameFromBounds(
					this.padBounds({ x0, y0, x1, y1 }, session.overlay),
					session.overlay,
				),
			};
			this.renderSelection();
		} else {
			this.selection = null;
		}
		this.setStroking(false);
	}

	private finishMoveSelection(): void {
		const move = this.moveSession;
		this.moveSession = null;
		if (!move) return;
		const after = new Map<string, number[]>();
		for (const id of move.ids) {
			const stroke = this.findStrokeById(id);
			if (stroke) after.set(id, stroke.points.slice());
		}
		const apply = (snapshot: Map<string, number[]>) => {
			for (const [id, points] of snapshot) {
				const stroke = this.findStrokeById(id);
				if (stroke) stroke.points = points.slice();
			}
		};
		this.history.push({
			label: "移动笔迹",
			undo: () => apply(move.originals),
			redo: () => apply(after),
		});
		this.markDirty();
		this.refreshSelectionFrame();
		this.renderSelection();
		this.setStroking(false);
	}

	/* ------------------------------------------------------------------ */
	/* Selection frame (oriented rectangle around the selected ink)        */
	/* ------------------------------------------------------------------ */

	private pageSize(overlay: PageOverlay): { width: number; height: number } {
		return { width: overlay.widthPx || 1, height: overlay.heightPx || 1 };
	}

	/** Selection frame in css px of the given overlay. */
	private framePx(overlay: PageOverlay): FramePx | null {
		const frame = this.selection?.frame;
		if (!frame) return null;
		const { width, height } = this.pageSize(overlay);
		return {
			cx: frame.cx * width,
			cy: frame.cy * height,
			hw: frame.hw * width,
			hh: frame.hh * height,
			angle: frame.angle,
		};
	}

	private frameFromBounds(
		bounds: { x0: number; y0: number; x1: number; y1: number },
		overlay: PageOverlay,
	): SelectionFrame {
		const { width, height } = this.pageSize(overlay);
		const px = frameFromBox(bounds, width, height);
		return {
			cx: px.cx / width,
			cy: px.cy / height,
			hw: px.hw / width,
			hh: px.hh / height,
			angle: 0,
		};
	}

	/**
	 * Re-fits the frame around the strokes while keeping its current angle —
	 * i.e. the tight oriented bounding box. Running this every frame is what
	 * makes the frame follow a drag and stay the same size under rotation.
	 */
	private refreshSelectionFrame(): void {
		const selection = this.selection;
		if (!selection) return;
		const overlay = this.overlays.get(selection.page);
		if (!overlay) return;
		const strokes = this.collectSelectedStrokes();
		if (strokes.length === 0) return;
		const { width, height } = this.pageSize(overlay);
		const angle = selection.frame.angle;
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		let x0 = Infinity;
		let y0 = Infinity;
		let x1 = -Infinity;
		let y1 = -Infinity;
		const visit = (nx: number, ny: number): void => {
			const px = nx * width;
			const py = ny * height;
			const lx = cos * px + sin * py;
			const ly = -sin * px + cos * py;
			if (lx < x0) x0 = lx;
			if (lx > x1) x1 = lx;
			if (ly < y0) y0 = ly;
			if (ly > y1) y1 = ly;
		};
		for (const stroke of strokes) {
			for (let i = 0; i + 1 < stroke.points.length; i += 3) {
				visit(stroke.points[i], stroke.points[i + 1]);
			}
			for (const ring of stroke.rings ?? []) {
				for (let i = 0; i + 1 < ring.length; i += 2) visit(ring[i], ring[i + 1]);
			}
		}
		if (!Number.isFinite(x0)) return;
		const pad = 10;
		const localCx = (x0 + x1) / 2;
		const localCy = (y0 + y1) / 2;
		const hw = Math.max(1, (x1 - x0) / 2 + pad);
		const hh = Math.max(1, (y1 - y0) / 2 + pad);
		selection.frame = {
			cx: (cos * localCx - sin * localCy) / width,
			cy: (sin * localCx + cos * localCy) / height,
			hw: hw / width,
			hh: hh / height,
			angle,
		};
	}

	private selectionContains(overlay: PageOverlay, x: number, y: number): boolean {
		const frame = this.framePx(overlay);
		if (!frame) return false;
		const { width, height } = this.pageSize(overlay);
		const px = x * width;
		const py = y * height;
		const cos = Math.cos(frame.angle);
		const sin = Math.sin(frame.angle);
		const dx = px - frame.cx;
		const dy = py - frame.cy;
		const lx = cos * dx + sin * dy;
		const ly = -sin * dx + cos * dy;
		return Math.abs(lx) <= frame.hw && Math.abs(ly) <= frame.hh;
	}

	/* ------------------------------------------------------------------ */
	/* Selection transform (scale / rotate)                                */
	/* ------------------------------------------------------------------ */

	/** Corner / edge square or rotate knob under the pointer, if any. */
	private selectionHandleAt(
		overlay: PageOverlay,
		x: number,
		y: number,
	): HandleName | null {
		const selection = this.selection;
		if (!selection || selection.page !== overlay.pageNumber) return null;
		if (selection.ids.size === 0) return null;
		const frame = this.framePx(overlay);
		if (!frame) return null;
		const px = x * this.pageSize(overlay).width;
		const py = y * this.pageSize(overlay).height;
		const knob = selectionKnob(frame, this.pageSize(overlay));
		if (Math.hypot(px - knob.x, py - knob.y) <= 14) return "rotate";
		const corners = frameCorners(frame);
		const cornerNames: HandleName[] = ["nw", "ne", "se", "sw"];
		for (let i = 0; i < corners.length; i++) {
			if (Math.hypot(px - corners[i].x, py - corners[i].y) <= SELECTION_HANDLE_HIT_PX) {
				return cornerNames[i];
			}
		}
		// Edge midpoints resize a single axis.
		const edgeNames: HandleName[] = ["n", "e", "s", "w"];
		const edges = frameEdges(frame);
		for (let i = 0; i < edges.length; i++) {
			if (
				Math.hypot(px - edges[i].mx, py - edges[i].my) <=
				SELECTION_HANDLE_HIT_PX - 1
			) {
				return edgeNames[i];
			}
		}
		return null;
	}

	private beginTransform(
		overlay: PageOverlay,
		point: PagePoint,
		handle: HandleName,
	): void {
		const selection = this.selection;
		if (!selection) return;
		const strokes = this.collectSelectedStrokes();
		if (strokes.length === 0) return;
		const frame = this.framePx(overlay);
		if (!frame) return;
		const { width, height } = this.pageSize(overlay);
		const startX = point.x * width;
		const startY = point.y * height;
		const corners = frameCorners(frame);
		const edges = frameEdges(frame);
		const cornerNames: HandleName[] = ["nw", "ne", "se", "sw"];
		const edgeNames: HandleName[] = ["n", "e", "s", "w"];
		const cornerIndex = cornerNames.indexOf(handle);
		const edgeIndex = edgeNames.indexOf(handle);
		let anchor = { x: frame.cx, y: frame.cy };
		if (cornerIndex >= 0) {
			anchor = corners[(cornerIndex + 2) % 4];
		} else if (edgeIndex >= 0) {
			// Pinned to the opposite edge, so only the grabbed axis changes.
			anchor = { x: edges[(edgeIndex + 2) % 4].mx, y: edges[(edgeIndex + 2) % 4].my };
		}
		const snapshots = new Map<string, StrokeSnapshot>();
		for (const stroke of strokes) snapshots.set(stroke.id, snapshotStroke(stroke));
		this.transformSession = {
			kind: handle === "rotate" ? "rotate" : "scale",
			overlay,
			ids: strokes.map((stroke) => stroke.id),
			snapshots,
			cx: anchor.x,
			cy: anchor.y,
			startX,
			startY,
			startAngle: Math.atan2(startY - frame.cy, startX - frame.cx),
			frameAngle: frame.angle,
			frame0: { ...selection.frame },
			knobEdge: selectionKnobEdge(frame),
			preview: null,
			axis: handle === "e" || handle === "w" ? "x" : handle === "n" || handle === "s" ? "y" : null,
			scaleX: 1,
			scaleY: 1,
			rotate: 0,
			label: "",
		};
		this.setStroking(true);
		this.plugin.log(`transform start ${handle} n=${strokes.length}`);
	}

	private updateTransform(event: PointerEvent, overlay: PageOverlay): void {
		const session = this.transformSession;
		if (!session) return;
		const { width, height } = this.pageSize(overlay);
		const point = this.pointFor(event, overlay, this.rectFor(overlay));
		if (!point) return;
		const px = point.x * width;
		const py = point.y * height;
		const cos = Math.cos(session.frameAngle);
		const sin = Math.sin(session.frameAngle);
		const done = perf.start("selection.transform");
		if (session.kind === "scale") {
			// Independent X / Y along the frame's own axes, so a rotated box is
			// resized along its edges instead of being sheared; Shift locks ratio.
			const toLocal = (x: number, y: number): { x: number; y: number } => {
				const dx = x - session.cx;
				const dy = y - session.cy;
				return { x: cos * dx + sin * dy, y: -sin * dx + cos * dy };
			};
			const start = toLocal(session.startX, session.startY);
			const now = toLocal(px, py);
			let scaleX = Math.abs(start.x) > 0.5 ? now.x / start.x : 1;
			let scaleY = Math.abs(start.y) > 0.5 ? now.y / start.y : 1;
			// Edge handles touch one axis only; the other must stay at 100% even
			// if the grab point was a few pixels off the edge midpoint.
			if (session.axis === "x") scaleY = 1;
			if (session.axis === "y") scaleX = 1;
			scaleX = clamp(scaleX, 0.05, 20);
			scaleY = clamp(scaleY, 0.05, 20);
			if (event.shiftKey && !session.axis) {
				const locked =
					Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
				scaleX = locked;
				scaleY = locked;
			}
			session.scaleX = scaleX;
			session.scaleY = scaleY;
			const percentX = Math.round(scaleX * 100);
			const percentY = Math.round(scaleY * 100);
			// Edge handles lock one axis: show only the axis that moved.
			session.label =
				percentX === percentY
					? `${percentX}%`
					: percentX === 100
						? `${percentY}%`
						: percentY === 100
							? `${percentX}%`
							: `${percentX}% × ${percentY}%`;
		} else {
			let angle = Math.atan2(py - session.cy, px - session.cx) - session.startAngle;
			if (event.shiftKey) {
				const step = Math.PI / 12;
				angle = Math.round(angle / step) * step;
			}
			session.rotate = angle;
			session.label = `${Math.round((angle * 180) / Math.PI)}°`;
			// The frame keeps its size and turns with the hand instead of being
			// re-fitted every frame (which made the box breathe while rotating).
			const frame = this.framePx(overlay);
			if (frame) session.preview = { ...frame, angle: session.frameAngle + angle };
		}
		const transform: InkTransform = {
			scaleX: session.scaleX,
			scaleY: session.scaleY,
			rotate: session.kind === "rotate" ? session.rotate : session.frameAngle,
			local: session.kind === "scale",
			cx: session.cx,
			cy: session.cy,
			pageWidth: width,
			pageHeight: height,
		};
		for (const id of session.ids) {
			const stroke = this.findStrokeById(id);
			const snapshot = session.snapshots.get(id);
			if (stroke && snapshot) applyTransform(stroke, snapshot, transform);
		}
		overlay.render();
		if (session.kind === "scale") this.refreshSelectionFrame();
		this.renderSelection(session.label);
		done();
	}

	private finishTransform(): void {
		const session = this.transformSession;
		this.transformSession = null;
		if (!session) return;
		if (session.kind === "rotate" && session.rotate !== 0 && this.selection) {
			this.selection.frame.angle = session.frameAngle + session.rotate;
		}
		const after = new Map<string, StrokeSnapshot>();
		for (const id of session.ids) {
			const stroke = this.findStrokeById(id);
			if (stroke) after.set(id, snapshotStroke(stroke));
		}
		const afterFrame: SelectionFrame | null = this.selection
			? { ...this.selection.frame }
			: null;
		const apply = (snapshots: Map<string, StrokeSnapshot>, frame: SelectionFrame | null): void => {
			for (const [id, snapshot] of snapshots) {
				const stroke = this.findStrokeById(id);
				if (stroke) restoreStroke(stroke, snapshot);
			}
			if (frame && this.selection) this.selection.frame = { ...frame };
			this.refreshSelectionFrame();
			this.renderSelection();
		};
		this.history.push({
			label: session.kind === "scale" ? "缩放笔迹" : "旋转笔迹",
			undo: () => apply(session.snapshots, session.frame0),
			redo: () => apply(after, afterFrame),
		});
		this.plugin.log(
			`transform ${session.kind} scale=${session.scaleX.toFixed(3)}x${session.scaleY.toFixed(
				3,
			)} rotate=${((session.rotate * 180) / Math.PI).toFixed(1)}`,
		);
		// Bake the turned frame into a fresh tight box around the ink.
		this.refreshSelectionFrame();
		this.renderSelection();
		this.markDirty();
		this.setStroking(false);
	}

	/* ------------------------------------------------------------------ */
	/* Selection nudge (arrow keys)                                        */
	/* ------------------------------------------------------------------ */

	nudgeSelection(dxPx: number, dyPx: number): boolean {
		const selection = this.selection;
		if (!selection || selection.ids.size === 0) return false;
		const overlay = this.overlays.get(selection.page);
		if (!overlay) return false;
		const strokes = this.collectSelectedStrokes();
		if (strokes.length === 0) return false;
		const width = overlay.widthPx || 1;
		const height = overlay.heightPx || 1;
		const before = strokes.map((stroke) => snapshotStroke(stroke));
		for (const stroke of strokes) translateStroke(stroke, dxPx / width, dyPx / height);
		const after = strokes.map((stroke) => snapshotStroke(stroke));
		const apply = (snapshots: StrokeSnapshot[]): void => {
			for (const snapshot of snapshots) {
				const stroke = this.findStrokeById(snapshot.id);
				if (stroke) restoreStroke(stroke, snapshot);
			}
			this.refreshSelectionFrame();
			this.renderSelection();
		};
		this.history.push({
			label: "微移笔迹",
			undo: () => apply(before),
			redo: () => apply(after),
		});
		this.refreshSelectionFrame();
		this.renderSelection();
		this.markDirty();
		return true;
	}

	private pointInPolygon(
		x: number,
		y: number,
		polygon: Array<[number, number]>,
	): boolean {
		let inside = false;
		for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
			const [xi, yi] = polygon[i];
			const [xj, yj] = polygon[j];
			if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
				inside = !inside;
			}
		}
		return inside;
	}

	private anyPointInPolygon(
		points: number[],
		polygon: Array<[number, number]>,
		rings?: number[][],
	): boolean {
		for (let i = 0; i < points.length / 3; i++) {
			if (this.pointInPolygon(points[i * 3], points[i * 3 + 1], polygon)) {
				return true;
			}
		}
		for (const ring of rings ?? []) {
			for (let i = 0; i + 1 < ring.length; i += 2) {
				if (this.pointInPolygon(ring[i], ring[i + 1], polygon)) return true;
			}
		}
		return false;
	}

	private strokeBounds(stroke: Stroke): {
		x0: number;
		y0: number;
		x1: number;
		y1: number;
	} {
		const points = stroke.points;
		let x0 = Infinity;
		let y0 = Infinity;
		let x1 = -Infinity;
		let y1 = -Infinity;
		for (let i = 0; i < points.length / 3; i++) {
			const x = points[i * 3];
			const y = points[i * 3 + 1];
			x0 = Math.min(x0, x);
			y0 = Math.min(y0, y);
			x1 = Math.max(x1, x);
			y1 = Math.max(y1, y);
		}
		for (const ring of stroke.rings ?? []) {
			for (let i = 0; i + 1 < ring.length; i += 2) {
				x0 = Math.min(x0, ring[i]);
				y0 = Math.min(y0, ring[i + 1]);
				x1 = Math.max(x1, ring[i]);
				y1 = Math.max(y1, ring[i + 1]);
			}
		}
		return { x0, y0, x1, y1 };
	}

	private findStrokeById(id: string): Stroke | null {
		const doc = this.doc;
		if (!doc) return null;
		for (const layer of doc.layers) {
			const stroke = layer.strokes.find((entry) => entry.id === id);
			if (stroke) return stroke;
		}
		return null;
	}

	private collectSelectedStrokes(): Stroke[] {
		const selection = this.selection;
		const doc = this.doc;
		if (!selection || !doc) return [];
		const result: Stroke[] = [];
		for (const layer of doc.layers) {
			for (const stroke of layer.strokes) {
				if (selection.ids.has(stroke.id)) result.push(stroke);
			}
		}
		return result;
	}

	private renderSelection(label?: string): void {
		const selection = this.selection;
		if (!selection) return;
		const overlay = this.overlays.get(selection.page);
		if (!overlay) return;
		const preview = this.transformSession?.preview;
		const frame = preview ?? this.framePx(overlay);
		if (!frame) return;
		// While turning, the knob stays on the edge it was grabbed from so it
		// travels with the hand instead of hopping to another side.
		const knobEdge = preview ? this.transformSession?.knobEdge : undefined;
		overlay.drawSelection({ frame, handles: true, label, knobEdge });
	}

	/** Selects every stroke on the visible page (Ctrl+A / select-all). */
	selectAll(): boolean {
		const doc = this.doc;
		const overlay = this.currentOverlay();
		if (!doc || !overlay) return false;
		const ids = new Set<string>();
		const strokes: Stroke[] = [];
		for (const layer of doc.layers) {
			for (const stroke of layer.strokes) {
				if (stroke.page !== overlay.pageNumber) continue;
				if (stroke.kind.startsWith("eraser")) continue;
				ids.add(stroke.id);
				strokes.push(stroke);
			}
		}
		if (ids.size === 0) return false;
		this.selection = {
			page: overlay.pageNumber,
			ids,
			frame: this.frameFromBounds(this.padBounds(boundsOf(strokes), overlay), overlay),
		};
		this.renderSelection();
		return true;
	}

	get hasSelection(): boolean {
		return Boolean(this.selection && this.selection.ids.size > 0);
	}

	/** Axis-aligned bounds of the current selection, in page-normalized coords. */
	get selectionFrame(): { x0: number; y0: number; x1: number; y1: number } | null {
		const selection = this.selection;
		if (!selection) return null;
		const overlay = this.overlays.get(selection.page);
		if (!overlay) return null;
		const frame = this.framePx(overlay);
		if (!frame) return null;
		const corners = frameCorners(frame);
		const xs = corners.map((corner) => corner.x);
		const ys = corners.map((corner) => corner.y);
		const { width, height } = this.pageSize(overlay);
		return {
			x0: Math.min(...xs) / width,
			y0: Math.min(...ys) / height,
			x1: Math.max(...xs) / width,
			y1: Math.max(...ys) / height,
		};
	}

	/** Rotation of the current selection frame, in radians. */
	get selectionAngle(): number {
		return this.selection?.frame.angle ?? 0;
	}

	get hasClipboard(): boolean {
		return Boolean(this.clipboard && this.clipboard.strokes.length > 0);
	}

	/**
	 * Double tap only opens the menu in the selection tool. The pen uses a long
	 * press instead, and the eraser has no menu at all.
	 */
	private maybeDoubleTap(
		overlay: PageOverlay,
		event: PointerEvent,
		point: PagePoint,
		rect: { width: number; height: number },
	): boolean {
		if (this.plugin.tool !== "select") return false;
		if (!this.plugin.settings.tapGestureMenuEnabled) return false;
		// A tap on a transform handle is aiming at the handle, not at the ink:
		// grabbing the same corner twice in quick succession must not turn into
		// a double tap and swallow the drag.
		if (this.selectionHandleAt(overlay, point.x, point.y)) return false;
		const now = perf.now();
		const previous = this.lastTap;
		this.lastTap = { time: now, x: point.x, y: point.y };
		if (!previous) return false;
		if (now - previous.time > 340) return false;
		if (Math.abs(point.x - previous.x) * rect.width > 12) return false;
		if (Math.abs(point.y - previous.y) * rect.height > 12) return false;
		// Double tap on ink selects it, on empty paper just opens the menu.
		if (!this.selectStrokeAt(overlay, point.x, point.y)) this.clearSelection();
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
		this.plugin.log("double tap select");
		this.openSelectionMenu(event.clientX, event.clientY);
		return true;
	}

	/** Selects the topmost stroke under a point (tap / light long press). */
	private selectStrokeAt(overlay: PageOverlay, x: number, y: number): boolean {
		const doc = this.doc;
		if (!doc) return false;
		const pageW = overlay.widthPx || 1;
		const pageH = overlay.heightPx || 1;
		for (let li = doc.layers.length - 1; li >= 0; li--) {
			const layer = doc.layers[li];
			if (!layer.visible || layer.locked) continue;
			for (let i = layer.strokes.length - 1; i >= 0; i--) {
				const stroke = layer.strokes[i];
				if (stroke.page !== overlay.pageNumber) continue;
				if (stroke.kind.startsWith("eraser")) continue;
				if (!strokeHitTest(stroke, x, y, pageW, pageH, { tolerancePx: 10 })) continue;
				this.selection = {
					page: overlay.pageNumber,
					ids: new Set([stroke.id]),
					frame: this.frameFromBounds(
						this.padBounds(boundsOf([stroke]), overlay),
						overlay,
					),
				};
				this.renderSelection();
				return true;
			}
		}
		return false;
	}

	/** Removes the dot left by the first tap of a double tap. */
	private dropLastTapDot(now: number): void {
		const id = this.lastTapStrokeId;
		this.lastTapStrokeId = null;
		if (!id || now - this.lastTapStrokeAt > 500) return;
		const doc = this.doc;
		if (!doc) return;
		for (const layer of doc.layers) {
			const index = layer.strokes.findIndex((stroke) => stroke.id === id);
			if (index >= 0) {
				layer.strokes.splice(index, 1);
				this.afterChange();
				return;
			}
		}
	}

	/** Grows a selection box by a few pixels so its dashed edge is grabbable. */
	private padBounds(
		b: { x0: number; y0: number; x1: number; y1: number },
		overlay: PageOverlay,
		padPx = 10,
	): { x0: number; y0: number; x1: number; y1: number } {
		const w = overlay.widthPx || 1;
		const h = overlay.heightPx || 1;
		return {
			x0: b.x0 - padPx / w,
			y0: b.y0 - padPx / h,
			x1: b.x1 + padPx / w,
			y1: b.y1 + padPx / h,
		};
	}

	private openSelectionMenu(clientX: number, clientY: number): void {
		this.selectionMenu ??= new SelectionMenu(this);
		this.selectionMenu.open(
			clientX,
			clientY,
			undefined,
			this.menuPlacement(clientX, clientY),
		);
	}

	/**
	 * Anchors the menu just outside the selection frame, keeping clear of the
	 * rotate knob (which sticks out above the frame and follows the hand).
	 */
	private menuPlacement(
		clientX: number,
		clientY: number,
	): { frame: Box; knob: Box } | undefined {
		const selection = this.selection;
		if (!selection) return undefined;
		const overlay = this.overlays.get(selection.page);
		if (!overlay) return undefined;
		const rect = this.rectFor(overlay);
		const frame = this.framePx(overlay);
		if (!frame) return undefined;
		const corners = frameCorners(frame);
		const xs = corners.map((corner) => corner.x);
		const ys = corners.map((corner) => corner.y);
		const box: Box = {
			left: rect.left + Math.min(...xs),
			top: rect.top + Math.min(...ys),
			right: rect.left + Math.max(...xs),
			bottom: rect.top + Math.max(...ys),
		};
		const knob = selectionKnob(frame, this.pageSize(overlay));
		const radius = SELECTION_ROTATE_OFFSET_PX + 10;
		return {
			frame: box,
			knob: {
				left: rect.left + knob.x - radius,
				top: rect.top + knob.y - radius,
				right: rect.left + knob.x + radius,
				bottom: rect.top + knob.y + radius,
			},
		};
	}

	/** Abandons the in-progress stroke without committing it. */
	private discardSession(): void {
		const session = this.session;
		this.session = null;
		this.pendingLive = null;
		if (this.liveRaf) {
			if (window.cancelAnimationFrame) window.cancelAnimationFrame(this.liveRaf);
			else window.clearTimeout(this.liveRaf);
			this.liveRaf = 0;
		}
		this.cancelShapeHold();
		if (session) session.overlay.clearLive();
	}

	/** Copies the current selection into the plugin's internal clipboard. */
	copySelection(): boolean {
		const strokes = this.collectSelectedStrokes();
		if (strokes.length === 0) return false;
		this.clipboard = {
			strokes: strokes.map((stroke) => JSON.parse(JSON.stringify(stroke)) as Stroke),
			page: this.selection?.page ?? 1,
		};
		this.plugin.log(`copy n=${strokes.length} page=${this.clipboard.page}`);
		this.notice(`已复制 ${strokes.length} 条笔迹`);
		return true;
	}

	cutSelection(): boolean {
		if (!this.copySelection()) return false;
		this.deleteSelection();
		return true;
	}

	deleteSelection(): boolean {
		const selection = this.selection;
		const doc = this.doc;
		if (!selection || !doc) return false;
		const removed: Array<{ stroke: Stroke; layer: Layer; index: number }> = [];
		for (const layer of doc.layers) {
			for (let i = layer.strokes.length - 1; i >= 0; i--) {
				const stroke = layer.strokes[i];
				if (!selection.ids.has(stroke.id)) continue;
				layer.strokes.splice(i, 1);
				removed.push({ stroke, layer, index: i });
			}
		}
		if (removed.length === 0) return false;
		this.history.push({
			label: "删除笔迹",
			undo: () => {
				for (const item of [...removed].sort((a, b) => a.index - b.index)) {
					item.layer.strokes.splice(Math.min(item.index, item.layer.strokes.length), 0, item.stroke);
				}
			},
			redo: () => {
				for (const item of removed) {
					const index = item.layer.strokes.findIndex((entry) => entry.id === item.stroke.id);
					if (index >= 0) item.layer.strokes.splice(index, 1);
				}
			},
		});
		this.clearSelection();
		this.afterChange();
		return true;
	}

	/** Pastes the clipboard onto the visible page, offset so it does not hide the original. */
	pasteClipboard(): boolean {
		const clipboard = this.clipboard;
		const doc = this.doc;
		if (!clipboard || !doc || clipboard.strokes.length === 0) {
			this.notice("剪贴板是空的：先复制或剪切笔迹");
			return false;
		}
		const layer = this.getWritableLayer();
		if (!layer) {
			this.notice("当前图层被锁定或不可见，无法粘贴");
			return false;
		}
		// Paste lands where the pen is (hover counts), so no selection is needed.
		const hover = this.hoverPoint;
		const overlay = hover?.overlay ?? this.currentOverlay();
		const page =
			hover?.overlay.pageNumber ?? this.selection?.page ?? overlay?.pageNumber ?? clipboard.page;
		const rect = overlay ? this.rectFor(overlay) : null;
		const source = boundsOf(clipboard.strokes);
		let dx = 0;
		let dy = 0;
		if (hover) {
			// The block's top-left goes to the pen tip. No clamp: the old
			// "keep the whole block on the page" rule collapsed the offset to 0
			// whenever the copied block was about as big as the page, so pasting
			// felt like it had a fixed position.
			dx = hover.x - source.x0;
			dy = hover.y - source.y0;
		} else if (rect && rect.width > 10) {
			dx = 8 / rect.width;
			dy = 8 / rect.height;
		}
		const created: Stroke[] = [];
		for (const source of clipboard.strokes) {
			const copy = JSON.parse(JSON.stringify(source)) as Stroke;
			copy.id = uid("s");
			copy.page = page;
			translateStroke(copy, dx, dy);
			layer.strokes.push(copy);
			created.push(copy);
		}
		const pasteOverlay = overlay ?? this.overlays.get(page) ?? null;
		this.selection = {
			page,
			ids: new Set(created.map((stroke) => stroke.id)),
			frame: pasteOverlay
				? this.frameFromBounds(
						this.padBounds(boundsOf(created), pasteOverlay),
						pasteOverlay,
					)
				: { cx: 0.5, cy: 0.5, hw: 0.1, hh: 0.1, angle: 0 },
		};
		this.history.push({
			label: "粘贴",
			undo: () => {
				for (const stroke of created) {
					const index = layer.strokes.findIndex((entry) => entry.id === stroke.id);
					if (index >= 0) layer.strokes.splice(index, 1);
				}
			},
			redo: () => {
				for (const stroke of created) {
					if (!layer.strokes.some((entry) => entry.id === stroke.id)) {
						layer.strokes.push(stroke);
					}
				}
			},
		});
		this.afterChange();
		this.renderSelection();
		this.plugin.log(
			`paste page=${page} layer=${layer.name} n=${created.length} offset=${dx.toFixed(4)},${dy.toFixed(4)}`,
		);
		return true;
	}

	private currentOverlay(): PageOverlay | null {
		if (this.lastOverlay && this.overlays.get(this.lastOverlay.pageNumber) === this.lastOverlay) {
			return this.lastOverlay;
		}
		const page = this.selection?.page;
		if (page !== undefined) {
			const overlay = this.overlays.get(page);
			if (overlay) return overlay;
		}
		for (const overlay of this.overlays.values()) return overlay;
		return null;
	}

	private clearSelection(): void {
		if (!this.selection) return;
		const overlay = this.overlays.get(this.selection.page);
		this.selection = null;
		overlay?.clearLive();
	}

	private beginErase(overlay: PageOverlay, event: PointerEvent): void {
		const layer = this.getWritableLayer();
		if (!layer) return;
		const point = this.pointFor(event, overlay);
		if (!point) return;
		this.beginEraseAt(overlay, point.x, point.y, point.p, layer);
	}

	private beginEraseAt(
		overlay: PageOverlay,
		x: number,
		y: number,
		pressure: number,
		layer: Layer,
	): void {
		const stroke: Stroke = {
			id: uid("s"),
			kind: "eraser",
			page: overlay.pageNumber,
			color: "#000000",
			width: this.plugin.settings.eraserWidth / REFERENCE_PAGE_WIDTH,
			opacity: 1,
			points: [x, y, this.eraserPressure(pressure)],
		};
		this.erased = {
			overlay,
			layerId: layer.id,
			layerOpacity: layer.opacity,
			stroke,
			lastX: x,
			lastY: y,
		};
		this.setStroking(true);
		this.requestErasePreview();
	}

	/** Pressure recorded on eraser points, so the swath can grow with the pen. */
	private eraserPressure(pressure: number): number {
		return this.plugin.settings.eraserPressureSize ? pressure : 0.5;
	}

	private hitStrokes(
		layer: Layer,
		overlay: PageOverlay,
		x: number,
		y: number,
	): Array<{ stroke: Stroke; index: number }> {
		const pageW = overlay.widthPx || 1;
		const pageH = overlay.heightPx || 1;
		const tolerance = Math.max(6, this.plugin.settings.eraserWidth / 3);
		const hits: Array<{ stroke: Stroke; index: number }> = [];
		for (let index = 0; index < layer.strokes.length; index++) {
			const stroke = layer.strokes[index];
			if (stroke.page !== overlay.pageNumber) continue;
			if (strokeHitTest(stroke, x, y, pageW, pageH, { tolerancePx: tolerance })) {
				hits.push({ stroke, index });
			}
		}
		return hits;
	}

	/** Sweeping whole-stroke erase: starts anywhere, removes every stroke it touches. */
	private beginStrokeErase(overlay: PageOverlay, event: PointerEvent): void {
		const layer = this.getWritableLayer();
		if (!layer) return;
		const point = this.pointFor(event, overlay);
		if (!point) return;
		const session: StrokeEraseSession = {
			type: "stroke-erase",
			overlay,
			layerId: layer.id,
			removed: [],
			seen: new Set(),
		};
		this.setStroking(true);
		this.session = session;
		// Starting on empty paper is normal: the session keeps running so the
		// sweep can reach strokes a moment later.
		const hits = this.hitStrokes(layer, overlay, point.x, point.y);
		if (hits.length > 0) {
			this.removeStrokes(layer, session, hits);
			overlay.render();
		}
	}

	private continueStrokeErase(
		event: PointerEvent,
		overlay: PageOverlay,
		session: StrokeEraseSession,
	): void {
		const doc = this.doc;
		const layer = doc ? findLayer(doc, session.layerId) : null;
		if (!layer) return;
		const point = this.pointFor(event, overlay);
		if (!point) return;
		const hits = this.hitStrokes(layer, overlay, point.x, point.y);
		if (hits.length === 0) return;
		this.removeStrokes(layer, session, hits);
		overlay.render();
	}

	private removeStrokes(
		layer: Layer,
		session: StrokeEraseSession,
		hits: Array<{ stroke: Stroke; index: number }>,
	): void {
		const targets = hits
			.filter((hit) => !session.seen.has(hit.stroke.id))
			.sort((a, b) => b.index - a.index);
		for (const target of targets) {
			const index = layer.strokes.findIndex((entry) => entry.id === target.stroke.id);
			if (index < 0) continue;
			layer.strokes.splice(index, 1);
			session.seen.add(target.stroke.id);
			session.removed.push({ stroke: target.stroke, index });
		}
	}

	private finishStrokeErase(session: StrokeEraseSession, layer: Layer): void {
		if (session.removed.length === 0) {
			this.renderNow();
			return;
		}
		const removed = [...session.removed];
		this.clearSelection();
		this.plugin.log(`stroke erase removed=${removed.length}`);
		this.history.push({
			label: "整笔删除",
			undo: () => {
				for (const item of [...removed].sort((a, b) => a.index - b.index)) {
					if (layer.strokes.some((entry) => entry.id === item.stroke.id)) continue;
					const index = Math.min(item.index, layer.strokes.length);
					layer.strokes.splice(index, 0, item.stroke);
				}
			},
			redo: () => {
				for (const item of removed) {
					const index = layer.strokes.findIndex(
						(entry) => entry.id === item.stroke.id,
					);
					if (index >= 0) layer.strokes.splice(index, 1);
				}
			},
		});
		this.afterChange(session.overlay);
	}

	private onPointerMove(event: PointerEvent, overlay: PageOverlay): void {
		// The ring is a DOM overlay and the stroke handlers stop propagation,
		// so it has to be moved from here as well, not only on hover.
		this.trackBrushRing(event, overlay);
		if (!this.drawing && !this.externalOverlay) return;
		if (this.selectSession || this.moveSession || this.transformSession) {
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
			this.updateSelection(event, overlay);
			return;
		}
		const session = this.session;
		if (session && session.overlay === overlay) {
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
			if (session.type === "freehand") this.extendFreehand(event, overlay, session);
			else if (session.type === "stroke-erase")
				this.continueStrokeErase(event, overlay, session);
			else this.updateShape(event, overlay, session);
			return;
		}
		const erased = this.erased;
		if (erased && erased.overlay === overlay) {
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
			this.extendErase(event, overlay, erased);
		}
	}

	private onPointerUp(event: PointerEvent, overlay: PageOverlay): void {
		this.cancelHoldErase();
		this.plugin.log(
			`end ${event.type} id=${event.pointerId} type=${event.pointerType} b=${event.buttons} p=${Number(
				event.pressure ?? 0,
			).toFixed(2)}`,
		);
		if (this.session && this.session.overlay === overlay) {
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
			this.finishSession();
		}
		if (this.erased && this.erased.overlay === overlay) {
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
			this.finishErase();
		}
		if (this.selectSession) {
			const session = this.selectSession;
			const rect = this.rectFor(overlay);
			const dragged =
				Math.abs((session.points[3] ?? session.points[0]) - session.points[0]) *
					(overlay.widthPx || 1) > 6 ||
				Math.abs((session.points[4] ?? session.points[1]) - session.points[1]) *
					(overlay.heightPx || 1) > 6 ||
				session.points.length > 6;
			this.finishSelection();
			if (this.selection) {
				// Picking ink always opens the menu, no second tap needed.
				this.openSelectionMenu(event.clientX, event.clientY);
			} else if (!dragged && this.pointIsOnPage(overlay, event)) {
				// Empty click: no menu. If selection mode was entered by a long
				// press, an empty click hands the pen back.
				if (this.selectEnteredByHold) {
					this.selectEnteredByHold = false;
					this.plugin.setTool("pen");
				}
			}
		}
		if (this.moveSession) {
			this.finishMoveSelection();
			// Menu follows the drop point.
			this.openSelectionMenu(event.clientX, event.clientY);
		}
		if (this.transformSession) {
			this.finishTransform();
			this.openSelectionMenu(event.clientX, event.clientY);
		}
		this.activePointerId = null;
		if (!this.session && !this.erased) this.setStroking(false);
	}

	/** True when the pointer is inside the page (used to place the menu). */
	private pointIsOnPage(overlay: PageOverlay, event: PointerEvent): boolean {
		const rect = this.rectFor(overlay);
		return (
			event.clientX >= rect.left &&
			event.clientX <= rect.left + rect.width &&
			event.clientY >= rect.top &&
			event.clientY <= rect.top + rect.height
		);
	}

	private pendingLive: FreehandSession | null = null;

	private scheduleLiveAppend(session: FreehandSession): void {
		this.pendingLive = session;
		if (this.liveRaf) return;
		const run = () => {
			this.liveRaf = 0;
			const pending = this.pendingLive;
			this.pendingLive = null;
			if (!pending || pending !== this.session) return;
			if (this.lastLiveAt > 0) perf.add("frame.gap", perf.now() - this.lastLiveAt);
			this.lastLiveAt = perf.now();
			perf.count("live.frames");
			pending.overlay.appendLive(pending.stroke, pending.layerOpacity);
		};
		this.liveRaf = window.requestAnimationFrame
			? window.requestAnimationFrame(run)
			: window.setTimeout(run, 16);
	}

	private extendFreehand(
		event: PointerEvent,
		overlay: PageOverlay,
		session: FreehandSession,
	): void {
		perf.count("input.move");
		// event.timeStamp and performance.now() share the same time origin, so
		// this is how long the event waited before we even saw it.
		if (event.timeStamp > 0) perf.add("input.latency", perf.now() - event.timeStamp);
		if (!perf.enabled) {
			this.extendFreehandInner(event, overlay, session);
			return;
		}
		const done = perf.start("input.extend");
		try {
			this.extendFreehandInner(event, overlay, session);
		} finally {
			done();
		}
	}

	private extendFreehandInner(
		event: PointerEvent,
		overlay: PageOverlay,
		session: FreehandSession,
	): void {
		const rectStart = perf.now();
		const rect = this.rectFor(overlay);
		perf.add("input.rect", perf.now() - rectStart);
		session.lastPressure = event.pressure ?? session.lastPressure;
		const events =
			typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
		const list = events.length > 0 ? events : [event];
		let added = false;
		for (const ev of list) {
			const point = this.pointFor(ev, overlay, rect);
			if (!point) continue;
			const dx = (point.x - session.lastX) * rect.width;
			const dy = (point.y - session.lastY) * rect.height;
			if (dx * dx + dy * dy < MIN_POINT_DISTANCE_PX ** 2) continue;
			session.stroke.points.push(point.x, point.y, point.p);
			session.lastX = point.x;
			session.lastY = point.y;
			added = true;
		}
		if (!added) return;
		session.lastPointAt = perf.now();
		if (session.stroke.points.length === 3) {
			const next = session.lastPressure;
			if (Number.isFinite(next) && next > session.stroke.points[2]) {
				session.stroke.points[2] = next;
			}
		}
		this.armShapeHold(session);
		// Any real movement means the pen is writing, not holding still.
		if (this.holdOrigin) {
			const dx = (session.lastX - this.holdOrigin.x) * rect.width;
			const dy = (session.lastY - this.holdOrigin.y) * rect.height;
			const radius = Math.max(
				HOLD_CANCEL_PX,
				this.plugin.settings.eraserHoldRadiusPx,
			);
			if (dx * dx + dy * dy > radius * radius) {
				this.holdSelectAt = null;
				this.cancelHoldErase();
			}
		}
		perf.count("points.added", list.length);
		if (session.stroke.kind === "eraser-lasso") {
			overlay.drawFreehandGuide(session.stroke);
			return;
		}
		this.scheduleLiveAppend(session);
	}

	private updateShape(
		event: PointerEvent,
		overlay: PageOverlay,
		session: ShapeSession,
	): void {
		const rect = this.rectFor(overlay);
		const point = this.pointFor(event, overlay, rect);
		if (!point) return;
		let { x, y } = point;
		const kind = session.stroke.kind;
		if (kind === "line" || kind === "arrow") {
			if (event.shiftKey) {
				const constrained = this.constrainShape(session, x, y, rect);
				x = constrained.x;
				y = constrained.y;
			}
			session.guide = undefined;
		} else {
			const dxPx = (x - session.startX) * rect.width;
			const dyPx = (y - session.startY) * rect.height;
			const ax = Math.abs(dxPx);
			const ay = Math.abs(dyPx);
			let snapped = event.shiftKey;
			if (!snapped && Math.min(ax, ay) > 8 && Math.abs(ax - ay) <= 12) {
				snapped = true;
			}
			if (snapped) {
				const side = event.shiftKey ? Math.max(ax, ay) : (ax + ay) / 2;
				x = clamp(
					session.startX + (dxPx < 0 ? -side : side) / rect.width,
					0,
					1,
				);
				y = clamp(
					session.startY + (dyPx < 0 ? -side : side) / rect.height,
					0,
					1,
				);
				session.guide = {
					kind: kind === "ellipse" ? "ellipse" : "rect",
					x0: session.startX,
					y0: session.startY,
					x1: x,
					y1: y,
				};
			} else {
				session.guide = undefined;
			}
		}
		session.stroke.points = [session.startX, session.startY, 0.5, x, y, 0.5];
		this.scheduleLiveRender();
	}

	private constrainShape(
		session: ShapeSession,
		x: number,
		y: number,
		rect: { width: number; height: number },
	): { x: number; y: number } {
		const dxPx = (x - session.startX) * rect.width;
		const dyPx = (y - session.startY) * rect.height;
		const kind = session.stroke.kind;
		if (kind === "line" || kind === "arrow") {
			const step = Math.PI / 4;
			const angle = Math.round(Math.atan2(dyPx, dxPx) / step) * step;
			const length = Math.hypot(dxPx, dyPx);
			return {
				x: clamp(session.startX + (Math.cos(angle) * length) / rect.width, 0, 1),
				y: clamp(session.startY + (Math.sin(angle) * length) / rect.height, 0, 1),
			};
		}
		const side = Math.max(Math.abs(dxPx), Math.abs(dyPx));
		const sx = dxPx < 0 ? -1 : 1;
		const sy = dyPx < 0 ? -1 : 1;
		return {
			x: clamp(session.startX + (sx * side) / rect.width, 0, 1),
			y: clamp(session.startY + (sy * side) / rect.height, 0, 1),
		};
	}

	private scheduleLiveRender(): void {
		const session = this.session;
		if (!session || session.type === "stroke-erase") return;
		// Synchronous redraw: rAF can be starved while the pen is producing
		// events, which made fast handwriting appear only after the pen stopped.
		if (session.stroke.kind === "eraser-rect") {
			const guide =
				session.type === "shape" && session.guide
					? session.guide
					: {
							kind: "rect" as const,
							x0: session.stroke.points[0],
							y0: session.stroke.points[1],
							x1: session.stroke.points[3],
							y1: session.stroke.points[4],
						};
			session.overlay.drawGuideOnly(guide);
			return;
		}
		session.overlay.drawLive(
			session.stroke,
			session.layerOpacity,
			session.type === "shape" ? session.guide : undefined,
		);
	}

	private finishSession(): void {
		if (!perf.enabled) {
			this.finishSessionInner();
			return;
		}
		const done = perf.start("commit.total");
		try {
			this.finishSessionInner();
		} finally {
			done();
		}
	}

	private finishSessionInner(): void {
		this.cancelShapeHold();
		const session = this.session;
		this.session = null;
		this.pendingLive = null;
		if (this.liveRaf) {
			if (window.cancelAnimationFrame) window.cancelAnimationFrame(this.liveRaf);
			else window.clearTimeout(this.liveRaf);
			this.liveRaf = 0;
		}
		if (!session) return;
		const doc = this.doc;
		const layer = doc ? findLayer(doc, session.layerId) : null;
		if (!layer) {
			session.overlay.clearLive();
			this.renderNow();
			return;
		}
		if (session.type === "stroke-erase") {
			this.finishStrokeErase(session, layer);
			return;
		}
		if (session.type === "shape") {
			const rect = this.rectFor(session.overlay, true);
			const points = session.stroke.points;
			const dx = (points[3] - points[0]) * rect.width;
			const dy = (points[4] - points[1]) * rect.height;
			if (Math.hypot(dx, dy) < MIN_SHAPE_SIZE_PX) {
				session.overlay.clearLive();
				this.renderNow();
				return;
			}
		}
		if (
			session.stroke.kind === "eraser-lasso" &&
			session.stroke.points.length < 12
		) {
			session.overlay.clearLive();
			this.renderNow();
			return;
		}
		const stroke = session.stroke;
		// A tap with the pen must not leave a dot: treat it as "select this
		// stroke" instead. Long-press-select is handled earlier, in onPointerUp.
		if (
			session.type === "freehand" &&
			Math.floor(stroke.points.length / 3) === 1 &&
			this.plugin.tool !== "select"
		) {
			session.overlay.clearLive();
			if (this.selectStrokeAt(session.overlay, stroke.points[0], stroke.points[1])) {
				this.plugin.log("tap select");
				this.lastTapStrokeId = null;
			} else {
				this.clearSelection();
				this.afterChange(session.overlay);
			}
			return;
		}
		if (stroke.kind === "eraser-rect" || stroke.kind === "eraser-lasso") {
			const pageW = session.overlay.widthPx || 1;
			const pageH = session.overlay.heightPx || 1;
			const eraser: EraserGeometry =
				stroke.kind === "eraser-rect"
					? {
							kind: "rect",
							x0: stroke.points[0] * pageW,
							y0: stroke.points[1] * pageH,
							x1: stroke.points[3] * pageW,
							y1: stroke.points[4] * pageH,
						}
					: { kind: "polygon", points: toPagePoints(stroke.points, pageW, pageH) };
			session.overlay.clearLive();
			this.applyEraseRegion(
				session.overlay,
				layer,
				eraser,
				this.plugin.settings.eraserScope,
			);
			return;
		}
		if (layer.strokes.some((entry) => entry.id === stroke.id)) {
			session.overlay.clearLive();
			this.afterChange();
			return;
		}
		const guessed =
			session.type === "freehand" ? this.tryRecognize(stroke, session) : null;
		if (guessed) {
			this.commitRecognizedShape(session.overlay, layer, stroke, guessed);
			return;
		}
		layer.strokes.push(stroke);
		perf.mark("commit");
		if (session.type === "freehand" && Math.floor(stroke.points.length / 3) === 1) {
			this.lastTapStrokeId = stroke.id;
			this.lastTapStrokeAt = perf.now();
		}
		perf.add("stroke.points", stroke.points.length / 3);
		this.plugin.log(
			`commit kind=${stroke.kind} page=${stroke.page} points=${
				stroke.points.length / 3
			} layer=${layer.name}`,
		);
		this.history.push({
			label: session.type === "shape" ? "形状" : "绘制",
			undo: () => {
				const index = layer.strokes.findIndex((entry) => entry.id === stroke.id);
				if (index >= 0) layer.strokes.splice(index, 1);
			},
			redo: () => {
				if (!layer.strokes.some((entry) => entry.id === stroke.id)) {
					layer.strokes.push(stroke);
				}
			},
		});
		if (!this.commitStrokeFast(stroke, layer, session.overlay)) {
			perf.count("commit.full");
			session.overlay.clearLive();
			// Same trick as the erase path: the slow branch used to re-stroke the
			// whole page, which is what made every translucent stroke a hitch.
			perf.count("commit.region");
			session.overlay.renderRegion(boundsOf([stroke]));
			this.markDirty();
			this.measureCommitFrame();
		} else {
			perf.count("commit.fast");
			this.markDirty();
			this.measureCommitFrame();
		}
	}

	/**
	 * Time from "stroke committed" to the browser's next frame. Our own commit
	 * costs ~0.2 ms, so anything near 100 ms here is the compositor presenting
	 * the canvas — the metric that tells the two apart.
	 */
	private measureCommitFrame(): void {
		this.lastCommitAt = perf.now();
		if (typeof requestAnimationFrame !== "function") return;
		const started = this.lastCommitAt;
		window.requestAnimationFrame(() => {
			perf.add("commit.toFrame", perf.now() - started);
		});
	}

	/** Same measurement at stroke start, to tell "commit" from "stroke begin". */
	private measureStrokeFrame(): void {
		if (typeof requestAnimationFrame !== "function") return;
		const started = perf.now();
		window.requestAnimationFrame(() => {
			perf.add("stroke.toFrame", perf.now() - started);
		});
	}

	/**
	 * Try to turn a finished pen stroke into a clean shape. Conservative on
	 * purpose: a false positive is far more annoying than a missed shape.
	 */
	private tryRecognize(
		stroke: Stroke,
		session: FreehandSession,
	): RecognizedShape | null {
		const settings = this.plugin.settings;
		if (!settings.autoShapeEnabled) return null;
		if (stroke.kind !== "pen") return null;
		if (Math.floor(stroke.points.length / 3) < 4) return null;
		if (settings.autoShapeTrigger === "hold") {
			const rested = perf.now() - session.lastPointAt;
			if (rested < settings.autoShapeHoldMs) return null;
		}
		const rect = this.rectFor(session.overlay);
		if (rect.width < 10 || rect.height < 10) return null;
		return recognizeStroke(stroke.points, rect.width, rect.height);
	}

	/**
	 * Replaces hand-drawn ink with the recognized shape. Undo restores the
	 * original handwriting, so a wrong guess costs one Ctrl+Z.
	 */
	private commitRecognizedShape(
		overlay: PageOverlay,
		layer: Layer,
		original: Stroke,
		guessed: RecognizedShape,
	): void {
		const shape: Stroke = {
			...original,
			id: uid("s"),
			kind: guessed.kind,
			points: guessed.points,
		};
		this.plugin.log(
			`recognize kind=${guessed.kind} confidence=${guessed.confidence.toFixed(
				2,
			)} from=${Math.floor(original.points.length / 3)} points`,
		);
		perf.count("shape.recognized");
		overlay.clearLive();
		layer.strokes.push(shape);
		const index = layer.strokes.length - 1;
		this.history.push({
			label: "图形识别",
			undo: () => {
				const current = layer.strokes.findIndex((entry) => entry.id === shape.id);
				if (current >= 0) layer.strokes.splice(current, 1);
				layer.strokes.splice(Math.min(index, layer.strokes.length), 0, original);
			},
			redo: () => {
				const current = layer.strokes.findIndex((entry) => entry.id === original.id);
				if (current >= 0) layer.strokes.splice(current, 1);
				layer.strokes.splice(Math.min(index, layer.strokes.length), 0, shape);
			},
		});
		if (!this.commitStrokeFast(shape, layer, overlay)) {
			perf.count("commit.full");
			this.afterChange(overlay);
		} else {
			perf.count("commit.fast");
			this.markDirty();
		}
	}

	/**
	 * Erases with a region either by cutting strokes ("涂抹") or by removing
	 * whole strokes that the region touches ("整笔"). Snapshot-based undo keeps
	 * the operation atomic no matter how many strokes were affected.
	 */
	/**
	 * Erases with a region either by cutting strokes ("涂抹") or by removing
	 * whole strokes that the region touches ("整笔"). Snapshot-based undo keeps
	 * the operation atomic no matter how many strokes were affected.
	 */
	private applyEraseRegion(
		overlay: PageOverlay,
		layer: Layer,
		eraser: EraserGeometry,
		scope: "partial" | "whole",
	): void {
		const pageW = overlay.widthPx || 1;
		const pageH = overlay.heightPx || 1;
		const before = layer.strokes.slice();
		const done = perf.start("erase.total");
		const changed = eraseInk(
			layer.strokes,
			overlay.pageNumber,
			eraser,
			scope,
			pageW,
			pageH,
			() => uid("s"),
		);
		done();
		if (changed === 0) {
			this.renderNow();
			return;
		}
		const after = layer.strokes.slice();
		this.clearSelection();
		this.plugin.log(`erase region scope=${scope} changed=${changed}`);
		perf.count(scope === "whole" ? "erase.whole" : "erase.partial");
		this.history.push({
			label: scope === "whole" ? "整笔擦除" : "擦除",
			undo: () => {
				layer.strokes.splice(0, layer.strokes.length, ...before);
			},
			redo: () => {
				layer.strokes.splice(0, layer.strokes.length, ...after);
			},
		});
		// Redraw only where the eraser touched: re-stroking every stroke on the
		// page was the ~95 ms hitch that ended each erase gesture.
		perf.count("erase.region");
		overlay.renderRegion(this.eraseGeometryBox(eraser, pageW, pageH));
		this.markDirty();
	}

	/** Pixel bbox of an erase geometry, as normalized page coordinates. */
	private eraseGeometryBox(
		eraser: EraserGeometry,
		pageW: number,
		pageH: number,
	): { x0: number; y0: number; x1: number; y1: number } {
		let x0 = Infinity;
		let y0 = Infinity;
		let x1 = -Infinity;
		let y1 = -Infinity;
		const add = (x: number, y: number, pad: number): void => {
			if (!Number.isFinite(x) || !Number.isFinite(y)) return;
			if (x - pad < x0) x0 = x - pad;
			if (x + pad > x1) x1 = x + pad;
			if (y - pad < y0) y0 = y - pad;
			if (y + pad > y1) y1 = y + pad;
		};
		if (eraser.kind === "rect") {
			add(eraser.x0, eraser.y0, 0);
			add(eraser.x1, eraser.y1, 0);
		} else if (eraser.kind === "polygon") {
			for (const [x, y] of eraser.points) add(x, y, 0);
		} else {
			let radius = eraser.radius;
			for (const value of eraser.radii ?? []) {
				if (value > radius) radius = value;
			}
			const pad = radius * 1.5 + 4;
			for (const [x, y] of eraser.points) add(x, y, pad);
		}
		if (!Number.isFinite(x0)) {
			return { x0: 0, y0: 0, x1: 1, y1: 1 };
		}
		return {
			x0: x0 / Math.max(1, pageW),
			y0: y0 / Math.max(1, pageH),
			x1: x1 / Math.max(1, pageW),
			y1: y1 / Math.max(1, pageH),
		};
	}

	/**
	 * Fast path: when the finished stroke belongs to the topmost visible layer,
	 * paint only that stroke onto the existing composite instead of re-rendering
	 * every stroke on the page. This is what keeps fast handwriting responsive.
	 */
	private commitStrokeFast(
		stroke: Stroke,
		layer: Layer,
		overlay: PageOverlay,
	): boolean {
		const doc = this.doc;
		if (!doc) return false;
		if (
			stroke.kind === "eraser" ||
			stroke.kind === "eraser-rect" ||
			stroke.kind === "eraser-lasso"
		) {
			return false;
		}
		let top: Layer | null = null;
		for (const candidate of doc.layers) {
			if (candidate.visible && candidate.opacity > 0) top = candidate;
		}
		if (top !== layer) return false;
		if (stroke.kind === "pen" || stroke.kind === "highlighter") {
			overlay.commitLive(stroke, layer.opacity);
		} else {
			overlay.appendCommitted(stroke, layer.opacity);
		}
		return true;
	}
	private pruneErasedStrokes(
		layer: Layer,
		eraser: Stroke,
		overlay: PageOverlay,
	): Array<{ stroke: Stroke; index: number }> {
		const removed: Array<{ stroke: Stroke; index: number }> = [];
		const pageW = overlay.widthPx || 1;
		const pageH = overlay.heightPx || 1;
		for (let i = layer.strokes.length - 1; i >= 0; i--) {
			const candidate = layer.strokes[i];
			if (candidate.page !== eraser.page || candidate.id === eraser.id) continue;
			if (
				candidate.kind === "eraser" ||
				candidate.kind === "eraser-rect" ||
				candidate.kind === "eraser-lasso"
			) {
				continue;
			}
			if (!this.isFullyErased(candidate, eraser, pageW, pageH)) continue;
			layer.strokes.splice(i, 1);
			removed.push({ stroke: candidate, index: i });
		}
		return removed;
	}

	private isFullyErased(
		stroke: Stroke,
		eraser: Stroke,
		pageW: number,
		pageH: number,
	): boolean {
		const points = stroke.points;
		const count = Math.floor(points.length / 3);
		if (count < 1) return false;
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (let i = 0; i < count; i++) {
			const x = points[i * 3] * pageW;
			const y = points[i * 3 + 1] * pageH;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
		const ep = eraser.points;
		if (eraser.kind === "eraser-lasso") {
			const polygon: Array<[number, number]> = [];
			for (let i = 0; i < ep.length / 3; i++) {
				polygon.push([ep[i * 3] * pageW, ep[i * 3 + 1] * pageH]);
			}
			if (polygon.length < 3) return false;
			const inside = (x: number, y: number): boolean => {
				let result = false;
				for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
					const [xi, yi] = polygon[i];
					const [xj, yj] = polygon[j];
					if (
						yi > y !== yj > y &&
						x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
					) {
						result = !result;
					}
				}
				return result;
			};
			const corners: Array<[number, number]> = [
				[minX, minY],
				[maxX, minY],
				[minX, maxY],
				[maxX, maxY],
			];
			for (let i = 0; i < count; i++) {
				if (!inside(points[i * 3] * pageW, points[i * 3 + 1] * pageH)) return false;
			}
			for (const [x, y] of corners) {
				if (!inside(x, y)) return false;
			}
			return true;
		}
		if (eraser.kind === "eraser-rect") {
			if (ep.length < 6) return false;
			const x0 = Math.min(ep[0], ep[3]) * pageW;
			const x1 = Math.max(ep[0], ep[3]) * pageW;
			const y0 = Math.min(ep[1], ep[4]) * pageH;
			const y1 = Math.max(ep[1], ep[4]) * pageH;
			return minX >= x0 && maxX <= x1 && minY >= y0 && maxY <= y1;
		}
		const radius = Math.max(1, (eraser.width * pageW) / 2);
		const segments: number[] = [];
		for (let i = 0; i < ep.length / 3; i++) {
			segments.push(ep[i * 3] * pageW, ep[i * 3 + 1] * pageH);
		}
		const corners = [
			[minX, minY],
			[maxX, minY],
			[minX, maxY],
			[maxX, maxY],
		];
		const check = (x: number, y: number): boolean => {
			for (let i = 0; i < segments.length - 2; i += 2) {
				if (
					distanceToSegmentSq(
						x,
						y,
						segments[i],
						segments[i + 1],
						segments[i + 2],
						segments[i + 3],
					) <=
					radius * radius
				) {
					return true;
				}
			}
			return false;
		};
		for (let i = 0; i < count; i++) {
			if (!check(points[i * 3] * pageW, points[i * 3 + 1] * pageH)) return false;
		}
		for (const [x, y] of corners) {
			if (!check(x, y)) return false;
		}
		return true;
	}

	private extendErase(
		event: PointerEvent,
		overlay: PageOverlay,
		session: EraseSession,
	): void {
		const rect = this.rectFor(overlay);
		const point = this.pointFor(event, overlay, rect);
		if (!point) return;
		const distance = Math.hypot(
			(point.x - session.lastX) * rect.width,
			(point.y - session.lastY) * rect.height,
		);
		const steps = Math.max(1, Math.min(48, Math.ceil(distance / 2)));
		const pressure = this.eraserPressure(point.p);
		for (let i = 1; i <= steps; i++) {
			const t = i / steps;
			session.stroke.points.push(
				session.lastX + (point.x - session.lastX) * t,
				session.lastY + (point.y - session.lastY) * t,
				pressure,
			);
		}
		this.showEraserCursorAt(event.clientX, event.clientY, overlay, point.p);
		session.lastX = point.x;
		session.lastY = point.y;
		this.requestErasePreview();
	}

	private requestErasePreview(): void {
		if (this.eraseRaf) return;
		const run = () => {
			this.eraseRaf = 0;
			const session = this.erased;
			if (session) {
				session.overlay.render({
					layerId: session.layerId,
					stroke: session.stroke,
				});
			}
		};
		this.eraseRaf = window.requestAnimationFrame
			? window.requestAnimationFrame(run)
			: window.setTimeout(run, 16);
	}

	private finishErase(): void {
		const session = this.erased;
		this.erased = null;
		const fromHold = this.pressureErasing;
		this.pressureErasing = false;
		if (this.eraseRaf) {
			if (window.cancelAnimationFrame) window.cancelAnimationFrame(this.eraseRaf);
			else window.clearTimeout(this.eraseRaf);
			this.eraseRaf = 0;
		}
		if (!session) return;
		if (fromHold) {
			this.plugin.log(`hold erase end points=${session.stroke.points.length / 3}`);
			if (this.plugin.tool !== "eraser") this.hideEraserCursor();
		}
		const doc = this.doc;
		const layer = doc ? findLayer(doc, session.layerId) : null;
		session.overlay.clearLive();
		if (!layer) {
			this.renderNow();
			return;
		}
		const pageW = session.overlay.widthPx || 1;
		const pageH = session.overlay.heightPx || 1;
		const trail: Array<[number, number]> = [];
		const points = session.stroke.points;
		for (let i = 0; i < points.length; i += 3) {
			trail.push([points[i] * pageW, points[i + 1] * pageH]);
		}
		const radius = Math.max(2, (session.stroke.width * pageW) / 2);
		// Pressure erasing changes the swath width along the trail; keep it so
		// the hole matches what the user saw while erasing.
		const radii: number[] = [];
		if (this.plugin.settings.eraserPressureSize) {
			let varies = false;
			let min = 1;
			let max = 0;
			for (let i = 2; i < points.length; i += 3) {
				const p = Number.isFinite(points[i]) ? points[i] : 0.5;
				if (p < min) min = p;
				if (p > max) max = p;
			}
			varies = max - min > 0.03;
			if (varies) {
				for (let i = 0; i < points.length; i += 3) {
					const p = Number.isFinite(points[i + 2]) ? points[i + 2] : 0.5;
					radii.push(radius * pressureWidthFactor(p));
				}
			}
		}
		this.applyEraseRegion(
			session.overlay,
			layer,
			{ kind: "swath", points: trail, radius, ...(radii.length > 0 ? { radii } : {}) },
			"partial",
		);
	}

	private finishInteractions(): void {
		this.cancelHoldErase();
		this.cancelShapeHold();
		if (this.session) this.finishSession();
		if (this.erased) this.finishErase();
		if (this.selectSession) this.finishSelection();
		if (this.moveSession) this.finishMoveSelection();
		this.detachStrokeListeners();
		this.setStroking(false);
	}

	private getWritableLayer(): Layer | null {
		const doc = this.doc;
		if (!doc) return null;
		const layer = getActiveLayer(doc);
		if (!layer) return null;
		if (!layer.visible) {
			this.notice("当前图层已隐藏，无法绘制");
			return null;
		}
		if (layer.locked) {
			this.notice("当前图层已锁定，无法绘制");
			return null;
		}
		return layer;
	}

	/**
	 * Toggles the in-stroke CSS state.
	 *
	 * Deliberately does NOT touch `body` any more: the old `pdf-ink-writing`
	 * body class switched other plugins' `backdrop-filter` off twice per stroke
	 * (dev.44) and every toggle forced those blurred surfaces to re-rasterize.
	 * dev.51 already found the trick useless; the 137 ms `commit.toFrame` is
	 * what made removing it non-negotiable.
	 */
	private setStroking(active: boolean): void {
		// No container-level class any more: `.pdf-ink-stroking .textLayer`
		// forced a full style re-match over every page of a 749-page document
		// twice per stroke. Touching only the mounted pages is equivalent and
		// costs nothing.
		this.syncPointerTargets(active);
		// Keep swallowing the tail of compatibility mouse events, so a plugin's
		// `mouseup` handler cannot run while the next stroke is being started.
		if (!active) this.compatShieldUntil = perf.now() + 350;
		if (active) this.measureStrokeFrame();
	}

	/** Makes our live canvas hit-testable (and the text layer inert) in place. */
	private syncPointerTargets(stroking: boolean): void {
		const hideText = stroking || this.drawing;
		for (const overlay of this.overlays.values()) {
			overlay.live.setCssStyles({ pointerEvents: hideText ? "auto" : "" });
			overlay.live.setCssStyles({ cursor: hideText ? "crosshair" : "" });
			const layers = overlay.pageEl.querySelectorAll<HTMLElement>(".textLayer");
			layers.forEach((layer) => {
				layer.setCssStyles({ pointerEvents: hideText ? "none" : "" });
			});
		}
	}

	private readonly onHoverPointerMove = (event: PointerEvent): void => {
		this.updateHoverCursor(event);
		this.rememberHover(event);
	};

	/**
	 * Cursor policy (scheme C):
	 *  - thin pen / highlighter (<= 6 px): CSS dot-with-short-arms, zero latency
	 *  - thick pen / highlighter: a ring the size of the brush, drawn in DOM
	 *  - freehand eraser: the translucent disc
	 *  - everything else: the plain crosshair
	 */
	/**
	 * Re-evaluates the cursor for a pen position.
	 *
	 * Needed while the brush is resized (Shift + touch): the hover handler is
	 * not running then, so crossing the thin/thick threshold left the ring
	 * hidden but never applied the fine-point cursor — the pen looked invisible.
	 */
	refreshCursor(event: PointerEvent): void {
		this.updateHoverCursor(event);
	}

	private updateHoverCursor(event: PointerEvent): void {		const tool = this.plugin.tool;
		const pageEl = (event.target as HTMLElement | null)?.closest?.(
			".page",
		) as HTMLElement | null;
		const isInk = tool === "pen" || tool === "highlighter";
		const wantsRing = isInk && Boolean(pageEl);
		let size = 0;
		if (wantsRing) {
			const brush = this.plugin.brushFor(tool);
			const pageWidth = pageEl?.clientWidth || pageEl?.getBoundingClientRect().width || 1;
			size = clamp((brush.widthPx * pageWidth) / REFERENCE_PAGE_WIDTH, 2, 160);
		}
		const thin = wantsRing && size <= THIN_BRUSH_PX;
		this.containerEl.classList.toggle("pdf-ink-cursor-point", thin);
		this.containerEl.classList.toggle("pdf-ink-cursor-ring", wantsRing && !thin);
		if (!wantsRing || thin) this.hideBrushRing();
		if (wantsRing && !thin) this.showBrushRingAt(event.clientX, event.clientY, size);
		if (this.eraserDiscVisible() && pageEl) this.showEraserDisc(event, pageEl);
		else this.hideEraserCursor();
	}

	private ensureBrushRing(): HTMLElement {
		if (this.brushRing?.isConnected) return this.brushRing;
		const el = this.containerEl.ownerDocument.createElement("div");
		el.className = "pdf-ink-brush-ring";
		this.containerEl.appendChild(el);
		this.brushRing = el;
		return el;
	}

	/** Ring sized to the brush, positioned with a transform (no layout). */
	private showBrushRingAt(clientX: number, clientY: number, size: number): void {
		const hostRect = this.containerEl.getBoundingClientRect();
		const ring = this.ensureBrushRing();
		ring.setCssStyles({ display: "block" });
		ring.setCssStyles({ width: `${size}px` });
		ring.setCssStyles({ height: `${size}px` });
		ring.setCssStyles({
			transform: `translate3d(${clientX - hostRect.left - size / 2}px, ${
				clientY - hostRect.top - size / 2
			}px, 0)`,
		});
	}

	private trackBrushRing(event: PointerEvent, overlay: PageOverlay): void {
		if (!this.containerEl.classList.contains("pdf-ink-cursor-ring")) return;
		const tool = this.plugin.tool;
		if (tool !== "pen" && tool !== "highlighter") return;
		const brush = this.plugin.brushFor(tool);
		const size = clamp(
			(brush.widthPx * (overlay.widthPx || 1)) / REFERENCE_PAGE_WIDTH,
			2,
			160,
		);
		this.showBrushRingAt(event.clientX, event.clientY, size);
	}

	private hideBrushRing(): void {
		if (this.brushRing) this.brushRing.setCssStyles({ display: "none" });
	}

	/** Translucent disc preview for the freehand eraser. */
	private showEraserDisc(event: PointerEvent, pageEl: HTMLElement): void {
		const hostRect = this.containerEl.getBoundingClientRect();
		const pageRect = pageEl.getBoundingClientRect();
		const pageWidth = pageEl.clientWidth || pageRect.width || 1;
		const size = clamp(
			(this.plugin.settings.eraserWidth * pageWidth) / REFERENCE_PAGE_WIDTH,
			4,
			160,
		);
		const cursor = this.ensureEraserCursor();
		cursor.setCssStyles({ display: "block" });
		cursor.setCssStyles({ width: `${size}px` });
		cursor.setCssStyles({ height: `${size}px` });
		cursor.setCssStyles({
			transform: `translate3d(${event.clientX - hostRect.left - size / 2}px, ${
				event.clientY - hostRect.top - size / 2
			}px, 0)`,
		});
	}

	/**
	 * Remembers where the pen is hovering (no contact needed). Paste drops the
	 * clipboard at this point instead of asking for a selection first.
	 */
	private rememberHover(event: PointerEvent): void {
		const target = event.target as HTMLElement | null;
		const pageEl = target?.closest?.(".page") as HTMLElement | null;
		if (!pageEl) return;
		const pageNumber = Number(pageEl.dataset.pageNumber);
		const overlay = this.overlays.get(pageNumber);
		if (!overlay) return;
		const rect = overlay.live.getBoundingClientRect();
		if (rect.width < 2 || rect.height < 2) return;
		const x = (event.clientX - rect.left) / rect.width;
		const y = (event.clientY - rect.top) / rect.height;
		if (!Number.isFinite(x) || !Number.isFinite(y)) return;
		this.hoverPoint = { overlay, x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
	}

	private readonly hideEraserCursor = (): void => {
		if (this.eraserCursor) this.eraserCursor.setCssStyles({ display: "none" });
	};

	/** Pointer left the page (or the tool changed): drop every cursor hint. */
	private readonly hideHoverCursor = (): void => {
		this.hideEraserCursor();
		this.hideBrushRing();
		this.containerEl.classList.remove("pdf-ink-cursor-point", "pdf-ink-cursor-ring");
	};

	private ensureEraserCursor(): HTMLElement {
		if (this.eraserCursor?.isConnected) return this.eraserCursor;
		const el = this.containerEl.ownerDocument.createElement("div");
		el.className = "pdf-ink-eraser-cursor";
		this.containerEl.appendChild(el);
		this.eraserCursor = el;
		return el;
	}

	/** White translucent disc used for eraser + hold-to-erase feedback. */
	private showEraserCursorAt(
		clientX: number,
		clientY: number,
		overlay: PageOverlay,
		pressure: number,
	): void {
		const hostRect = this.containerEl.getBoundingClientRect();
		const pageWidth = overlay.widthPx || 1;
		const factor = this.plugin.settings.eraserPressureSize
			? pressureWidthFactor(pressure)
			: 1;
		const size = clamp(
			((this.plugin.settings.eraserWidth * pageWidth) / REFERENCE_PAGE_WIDTH) * factor,
			4,
			160,
		);
		const cursor = this.ensureEraserCursor();
		cursor.setCssStyles({ display: "block" });
		cursor.setCssStyles({ width: `${size}px` });
		cursor.setCssStyles({ height: `${size}px` });
		cursor.setCssStyles({
			transform: `translate3d(${clientX - hostRect.left - size / 2}px, ${
				clientY - hostRect.top - size / 2
			}px, 0)`,
		});
	}

	/** The translucent disc belongs to the freehand eraser only. */
	private eraserDiscVisible(): boolean {
		return (
			this.plugin.tool === "eraser" && this.plugin.settings.eraserRegion === "free"
		);
	}



	/** While Alt is held the canvas must not swallow text selection / links. */
	/**
	 * Text selection / link clicking is opt-in: it only works in the select
	 * tool while Alt is held. Everywhere else the text layer must not receive
	 * pointer events, or the pen would drag text instead of drawing.
	 */
	setAltPassthrough(active: boolean): void {
		this.altHeld = active;
		this.applyAltPassthrough();
	}

	private readonly applyAltPassthrough = (): void => {
		const allow = this.altHeld && this.plugin.tool === "select";
		this.containerEl.classList.toggle("pdf-ink-alt", allow);
	};

	private notice(message: string): void {		const now = Date.now();
		if (now - this.lastNotice < 2000) return;
		this.lastNotice = now;
		new Notice(`[PDF Ink] ${message}`);
	}

	/* ------------------------------------------------------------------ */
	/* Rendering                                                           */
	/* ------------------------------------------------------------------ */

	renderNow(): void {
		for (const overlay of this.overlays.values()) {
			overlay.setDoc(this.doc);
			overlay.measure();
			overlay.render();
		}
		this.renderSelection();
	}

	requestRender(): void {
		if (this.renderQueued) return;
		this.renderQueued = true;
		const run = () => {
			this.renderQueued = false;
			this.renderNow();
		};
		if (typeof window !== "undefined" && window.requestAnimationFrame) {
			window.requestAnimationFrame(run);
		} else {
			run();
		}
	}

	private scheduleDeferredRender(): void {
		this.requestRender();
		window.setTimeout(() => this.requestRender(), 120);
	}

	refreshLayout(): void {
		this.rectCache = null;
		for (const overlay of this.overlays.values()) overlay.measure();
		this.requestRender();
	}

	/**
	 * Chromium synthesizes a `contextmenu` event from a long pen press. If we
	 * only guard the canvas, the event still reaches the editor's handlers, so
	 * the guard lives on the document in the capture phase. Mouse right-clicks
	 * are left alone so PDF++ menus keep working.
	 */
	private readonly onDocumentContextMenu = (event: MouseEvent): void => {
		const target = event.target as Node | null;
		if (!target || !this.containerEl.contains(target)) return;
		const penRecent = perf.now() - this.lastPenAt < 5000;
		if (!this.drawing && !penRecent) return;
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
	};

	private hookLayoutListeners(): void {
		if (this.layoutHooked) return;
		this.layoutHooked = true;
		window.addEventListener("scroll", this.onLayoutShift, true);
		window.addEventListener("wheel", this.onLayoutShift, { passive: true, capture: true });
		window.addEventListener("resize", this.onLayoutShift);
		this.containerEl.ownerDocument.addEventListener("contextmenu", this.onDocumentContextMenu, true);
	}

	private unhookLayoutListeners(): void {
		if (!this.layoutHooked) return;
		this.layoutHooked = false;
		window.removeEventListener("scroll", this.onLayoutShift, true);
		window.removeEventListener("wheel", this.onLayoutShift, true);
		window.removeEventListener("resize", this.onLayoutShift);
		this.containerEl.ownerDocument.removeEventListener(
			"contextmenu",
			this.onDocumentContextMenu,
			true,
		);
	}

	afterChange(target?: PageOverlay): void {
		const done = perf.start("render.afterChange");
		try {
			if (target && this.overlays.get(target.pageNumber) === target) {
				target.ensureAttached();
				target.measure();
				target.render();
			} else {
				this.renderNow();
			}
		} finally {
			done();
		}
		this.markDirty();
	}

	markDirty(): void {
		if (!this.doc || !this.filePath) return;
		const done = perf.start("dirty.save");
		try {
			this.plugin.storage.scheduleSave(this.filePath, this.doc);
			this.notify();
		} finally {
			done();
		}
	}

	notify(): void {
		this.toolbar?.update();
		this.plugin.emitter.trigger("pdf-ink:doc-changed", this);
	}

	/* ------------------------------------------------------------------ */
	/* Undo / redo                                                         */
	/* ------------------------------------------------------------------ */

	undo(): void {
		if (this.history.undo()) this.afterChange();
	}

	redo(): void {
		if (this.history.redo()) this.afterChange();
	}

	/* ------------------------------------------------------------------ */
	/* Layers                                                              */
	/* ------------------------------------------------------------------ */

	addLayer(): Layer | null {
		const doc = this.doc;
		if (!doc) return null;
		const layer = createLayer(`图层 ${doc.layers.length + 1}`);
		doc.layers.push(layer);
		doc.activeLayerId = layer.id;
		const previousActive = doc.activeLayerId;
		this.history.push({
			label: "新建图层",
			undo: () => {
				const index = doc.layers.indexOf(layer);
				if (index >= 0) doc.layers.splice(index, 1);
				if (doc.activeLayerId === layer.id) {
					doc.activeLayerId = doc.layers[doc.layers.length - 1]?.id ?? null;
				}
			},
			redo: () => {
				if (!doc.layers.includes(layer)) doc.layers.push(layer);
				doc.activeLayerId = previousActive;
			},
		});
		this.afterChange();
		return layer;
	}

	deleteLayer(layerId: string): void {
		const doc = this.doc;
		if (!doc) return;
		const index = doc.layers.findIndex((layer) => layer.id === layerId);
		if (index < 0) return;
		const layer = doc.layers[index];
		const previousActive = doc.activeLayerId;
		doc.layers.splice(index, 1);
		let fallback: Layer | null = null;
		if (doc.layers.length === 0) {
			fallback = createLayer("图层 1");
			doc.layers.push(fallback);
			doc.activeLayerId = fallback.id;
		} else if (doc.activeLayerId === layer.id) {
			doc.activeLayerId = doc.layers[Math.min(index, doc.layers.length - 1)]?.id ?? null;
		}
		const createdFallback = fallback;
		this.history.push({
			label: "删除图层",
			undo: () => {
				if (createdFallback) {
					const fallbackIndex = doc.layers.indexOf(createdFallback);
					if (fallbackIndex >= 0) doc.layers.splice(fallbackIndex, 1);
				}
				doc.layers.splice(index, 0, layer);
				doc.activeLayerId = previousActive ?? layer.id;
			},
			redo: () => {
				const current = doc.layers.indexOf(layer);
				if (current >= 0) doc.layers.splice(current, 1);
				if (createdFallback) {
					if (!doc.layers.includes(createdFallback)) doc.layers.push(createdFallback);
					doc.activeLayerId = createdFallback.id;
				} else if (doc.activeLayerId === layer.id) {
					doc.activeLayerId =
						doc.layers[Math.min(index, doc.layers.length - 1)]?.id ??
						doc.layers[doc.layers.length - 1]?.id ??
						null;
				}
			},
		});
		this.afterChange();
	}

	setActiveLayer(layerId: string): void {
		const doc = this.doc;
		if (!doc || !findLayer(doc, layerId)) return;
		doc.activeLayerId = layerId;
		this.markDirty();
	}

	renameLayer(layerId: string, name: string): void {
		const doc = this.doc;
		const layer = doc ? findLayer(doc, layerId) : null;
		if (!layer) return;
		const trimmed = name.trim();
		if (!trimmed) return;
		layer.name = trimmed;
		this.markDirty();
	}

	setLayerVisible(layerId: string, visible: boolean): void {
		const doc = this.doc;
		const layer = doc ? findLayer(doc, layerId) : null;
		if (!layer) return;
		layer.visible = visible;
		this.afterChange();
	}

	setLayerLocked(layerId: string, locked: boolean): void {
		const doc = this.doc;
		const layer = doc ? findLayer(doc, layerId) : null;
		if (!layer) return;
		layer.locked = locked;
		this.markDirty();
	}

	setLayerOpacity(layerId: string, opacity: number): void {
		const doc = this.doc;
		const layer = doc ? findLayer(doc, layerId) : null;
		if (!layer) return;
		layer.opacity = clamp(opacity, 0, 1);
		this.afterChange();
	}

	moveLayer(layerId: string, delta: number): void {
		const doc = this.doc;
		if (!doc) return;
		const index = doc.layers.findIndex((layer) => layer.id === layerId);
		if (index < 0) return;
		const target = index + delta;
		if (target < 0 || target >= doc.layers.length) return;
		const [layer] = doc.layers.splice(index, 1);
		doc.layers.splice(target, 0, layer);
		this.history.push({
			label: "调整图层顺序",
			undo: () => {
				const current = doc.layers.indexOf(layer);
				if (current < 0) return;
				doc.layers.splice(current, 1);
				doc.layers.splice(index, 0, layer);
			},
			redo: () => {
				const current = doc.layers.indexOf(layer);
				if (current < 0) return;
				doc.layers.splice(current, 1);
				doc.layers.splice(target, 0, layer);
			},
		});
		this.afterChange();
	}

	/* ------------------------------------------------------------------ */
	/* Diagnostics                                                         */
	/* ------------------------------------------------------------------ */

	debugInfo(): Record<string, unknown> {
		const viewerEl = this.viewerEl;
		const count = (selector: string): number =>
			viewerEl ? viewerEl.querySelectorAll(selector).length : -1;
		const styleOf = (el: Element | null) => {
			if (!el) return null;
			const win = el.ownerDocument.defaultView;
			const cs = win?.getComputedStyle(el);
			if (!cs) return null;
			return {
				position: cs.position,
				zIndex: cs.zIndex,
				pointerEvents: cs.pointerEvents,
				display: cs.display,
				overflow: cs.overflow,
				width: cs.width,
				height: cs.height,
			};
		};
		const rectOf = (el: Element) => {
			const rect = el.getBoundingClientRect();
			return {
				x: Math.round(rect.left),
				y: Math.round(rect.top),
				w: Math.round(rect.width),
				h: Math.round(rect.height),
			};
		};
		const firstPage = this.pageEls.values().next().value as HTMLElement | undefined;
		return {
			filePath: this.filePath,
			viewType: this.view?.getViewType?.(),
			hasViewer: this.hasViewer,
			pdfContainerFound: Boolean(this.containerEl?.querySelector(".pdf-container")),
			viewerFound: Boolean(viewerEl),
			viewerRect: viewerEl ? rectOf(viewerEl) : null,
			hooked: Boolean(this.hookedBus),
			viewerResolved: Boolean(this.pdfWrapper),
			componentResolved: Boolean(this.component),
			domKeys: this.pdfWrapper?.dom ? Object.keys(this.pdfWrapper.dom) : [],
			viewerClass: viewerEl?.className ?? null,
			viewerChildren: viewerEl?.childElementCount ?? 0,
			selectorCounts: {
				page: count(".page"),
				pageWithNumber: count("div.page[data-page-number]"),
				anyPageNumber: count("[data-page-number]"),
				canvasWrapper: count(".canvasWrapper"),
				canvas: count("canvas"),
				total: count("*"),
			},
			pageEls: [...this.pageEls.keys()],
			overlays: [...this.overlays.entries()].map(([page, overlay]) => ({
				page,
				css: `${overlay.widthPx}x${overlay.heightPx}`,
				rect: rectOf(overlay.live),
				style: styleOf(overlay.live),
				pageStyle: styleOf(overlay.pageEl),
				canvases: overlay.pageEl.querySelectorAll("canvas").length,
				backing: `${overlay.committed.width}x${overlay.committed.height}`,
			})),
			firstPage: firstPage
				? {
						class: firstPage.className,
						rect: rectOf(firstPage),
						style: styleOf(firstPage),
						parentClass: firstPage.parentElement?.className ?? null,
						children: firstPage.children.length,
					}
				: null,
			drawing: this.drawing,
			toolbar: Boolean(this.toolbar),
			doc: this.doc
				? {
						layers: this.doc.layers.length,
						strokes: this.doc.layers.reduce(
							(sum, layer) => sum + layer.strokes.length,
							0,
						),
						// Real document size. `perf.counters["save.points"]` is a
						// running total across saves and reads ~20x larger — it is
						// not the annotation size and must not be quoted as such.
						points: this.doc.layers.reduce(
							(sum, layer) =>
								sum +
								layer.strokes.reduce(
									(total, stroke) => total + stroke.points.length / 3,
									0,
								),
							0,
						),
						ringPoints: this.doc.layers.reduce(
							(sum, layer) =>
								sum +
								layer.strokes.reduce(
									(total, stroke) =>
										total +
										(stroke.rings ?? []).reduce(
											(ringTotal, ring) => ringTotal + ring.length / 2,
											0,
										),
									0,
								),
							0,
						),
						eraserMasks: this.doc.layers.reduce(
							(sum, layer) =>
								sum +
								layer.strokes.filter((stroke) =>
									stroke.kind.startsWith("eraser"),
								).length,
							0,
						),
						activeLayerId: this.doc.activeLayerId,
					}
				: null,
		};
	}

	/* ------------------------------------------------------------------ */
	/* Cleanup                                                             */
	/* ------------------------------------------------------------------ */

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		if (this.attachTimer !== null) window.clearTimeout(this.attachTimer);
		this.finishInteractions();
		this.unhook();
		this.io?.disconnect();
		this.io = null;
		this.domObserver?.disconnect();
		this.domObserver = null;
		this.pageResizeObserver?.disconnect();
		this.pageResizeObserver = null;
		for (const pageNumber of [...this.overlays.keys()]) this.unmount(pageNumber);
		this.containerEl.removeEventListener("pointermove", this.onHoverPointerMove);
		this.containerEl.removeEventListener("pointerleave", this.hideHoverCursor);
		for (const type of ["mousedown", "mouseup", "click", "dblclick"]) {
			window.removeEventListener(type, this.onCompatMouse, true);
		}
		this.compatShieldUntil = 0;
		this.eraserCursor?.remove();
		this.eraserCursor = null;
		this.toolbar?.destroy();
		this.toolbar = null;
		this.unhookLayoutListeners();
		this.containerEl.classList.remove("pdf-ink-drawing");
		this.containerEl.classList.remove("pdf-ink-stroking");
		this.containerEl.classList.remove("pdf-ink-host");
		this.containerEl.ownerDocument.body.classList.remove("pdf-ink-writing");
	}
}
