import { Events, Notice, Plugin } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type { BrushKind, BrushPreset, EraserPreset, PresetKind } from "./brush";
import { autoPresetName, clonePresets, eraserPresetName } from "./brush";
import { PdfInkController } from "./controller";
import {
	ACTIONS,
	actionIdForSpec,
	matchesSpec,
	parseKeySpec,
	resolveBindings,
	specFromEvent,
} from "./keys";
import { setCanvasPixelBudget, setLowLatencyLive } from "./overlay";
import { perf } from "./perf";
import { DEFAULT_SETTINGS, PdfInkSettingTab } from "./settings";
import type { PdfInkSettings } from "./settings";
import { InkStorage } from "./storage";
import type { EraserRegion, EraserScope, Stroke, ToolName } from "./types";
import { InkLayersView, VIEW_TYPE_LAYERS } from "./ui/layers-view";
import { PdfInkLayersPopover } from "./ui/layers-popover";
import { ConfirmModal } from "./ui/confirm";
import { clamp } from "./util";

export interface Brush {
	color: string;
	widthPx: number;
	opacity: number;
}

/**
 * After a hold gesture ends, ink tools stay disabled for this long. Some pen
 * drivers report the tip as up the moment the side button is released, so the
 * rest of that physical movement would otherwise paint a stray stroke.
 */
const HOLD_RELEASE_GUARD_MS = 250;

export default class PdfInkPlugin extends Plugin {	settings: PdfInkSettings = { ...DEFAULT_SETTINGS };
	storage!: InkStorage;
	emitter = new Events();
	tool: ToolName = "pen";
	/** Shared between PDF leaves so copy in one tab pastes in another. */
	inkClipboard: { strokes: Stroke[]; page: number } | null = null;

	/** temporary tool while a "hold" key or the pen side button is down */
	private tempTool: {
		prev: ToolName;
		channel: "key" | "mouse";
		/** the key spec that armed it, so the right keyup can end it */
		spec?: string;
	} | null = null;
	private applyingTemp = false;
	/** keeps the mouse channel from re-arming until the button is released */
	private tempSuppressed = false;
	/** tip is currently on the surface, from the pen tracker below */
	private penDown = false;
	/** restore latched until the tip lifts (see endTempTool) */
	private pendingTempRestore: { prev: ToolName } | null = null;
	/** no new stroke may start until this timestamp */
	private strokeGuardUntil = 0;

	private readonly controllers = new Map<WorkspaceLeaf, PdfInkController>();
	private layersPopover: PdfInkLayersPopover | null = null;
	private lastController: PdfInkController | null = null;
	private settingsTimer: number | null = null;
	private readonly logLines: string[] = [];
	private lastDump = 0;
	private autoDumpScheduled = false;
	private readonly globalPointerDown = (event: PointerEvent): void => {
		this.handleGlobalPointerDown(event);
	};
	/** injected <style> that disables other plugins' backdrop-filter */
	private blurShieldEl: HTMLStyleElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.applyInkQuality();
		this.applyBlurShield();
		this.storage = new InkStorage(
			this.app,
			() => this.settings.folder,
			() => [...this.controllers.values()].some((controller) => controller.isStroking),
		);

		this.registerView(VIEW_TYPE_LAYERS, (leaf) => new InkLayersView(leaf, this));
		this.addSettingTab(new PdfInkSettingTab(this.app, this));
		this.addRibbonIcon("pencil", "PDF 墨迹：开启/关闭绘制", () => this.toggleDrawing());
		this.registerCommands();

		this.registerEvent(this.app.workspace.on("layout-change", () => this.scanLeaves()));
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.scanLeaves();
				this.trackActive();
				this.emitter.trigger("pdf-ink:active-changed");
			}),
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				this.scanLeaves();
				this.trackActive();
			}),
		);
		this.registerEvent(this.app.workspace.on("resize", () => this.refreshLayouts()));
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				void this.handleRename(oldPath, file.path);
			}),
		);
		// Capture phase: the editor's own keymap would otherwise swallow
		// Ctrl+C / Ctrl+V before the PDF view ever sees them.
		this.registerDomEvent(
			document,
			"keydown",
			(event) => this.handleKeyDown(event),
			true,
		);
		// Capture phase on both ends: the PDF viewer and the editor keymap both
		// handle keys, and a hold gesture dies if the keyup gets swallowed.
		this.registerDomEvent(
			document,
			"keyup",
			(event) => this.handleKeyUp(event),
			true,
		);
		this.registerDomEvent(window, "blur", () => {
			this.syncAlt(false);
			// No pointerup is coming while the window is unfocused, so a
			// deferred restore would leave the eraser latched forever.
			this.penDown = false;
			this.endTempTool();
			this.flushPendingTempRestore();
		});
		// Pen side buttons that drivers report as right / middle click stay
		// "held" in `buttons` while the tip goes down, so the state has to be
		// sampled on every pointer event, not just on pointerdown. Registering
		// `pointerdown` here (before the stroke handler) means the tool is
		// already the eraser when the same event starts a stroke.
		for (const type of [
			"pointerdown",
			"pointermove",
			"pointerup",
			"pointercancel",
		] as const) {
			window.addEventListener(type, this.syncMouseTempEraser, true);
			this.register(() =>
				window.removeEventListener(type, this.syncMouseTempEraser, true),
			);
		}
		// Tip-state tracker: a hold gesture releases *after* the pen lands, so
		// the switch back has to wait for the tip to leave the surface.
		for (const type of ["pointerdown", "pointerup", "pointercancel"] as const) {
			window.addEventListener(type, this.trackPenState, true);
			this.register(() =>
				window.removeEventListener(type, this.trackPenState, true),
			);
		}
		window.addEventListener("pointermove", this.handlePenAdjust, true);
		this.register(() =>
			window.removeEventListener("pointermove", this.handlePenAdjust, true),
		);
		// A side button mapped to right click would otherwise pop the page
		// menu in the middle of a stroke.
		this.registerDomEvent(document, "contextmenu", (event) => {
			if (!this.mouseEraserMask) return;
			if ((event as PointerEvent).pointerType !== "pen") return;
			const target = event.target as HTMLElement | null;
			if (!target?.closest?.(".pdf-container")) return;
			event.preventDefault();
		});
		// Capture phase on purpose: a pen / mouse landing on a PDF page must
		// start a stroke before the PDF viewer or text layer reacts to it.
		// Window capture also survives stopPropagation inside the PDF viewer.
		window.addEventListener("pointerdown", this.globalPointerDown, true);
		this.register(() =>
			window.removeEventListener("pointerdown", this.globalPointerDown, true),
		);

		this.app.workspace.onLayoutReady(() => {
			this.scanLeaves();
			this.trackActive();
		});
		this.observeLongTasks();
	}

	/**
	 * Long tasks (> 50 ms) block the pen path no matter how cheap our own
	 * drawing is, so record them to tell "our code is slow" apart from
	 * "something else froze the main thread".
	 */
	private longTaskObserver: PerformanceObserver | null = null;

	private observeLongTasks(): void {
		if (typeof PerformanceObserver === "undefined") return;
		try {
			const observer = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					perf.add("longtask", entry.duration);
					// startTime, not now(): the observer delivers batches late.
					perf.mark("longtask", entry.duration, entry.startTime);
					// Anything that long is not ours (our whole stroke path is
					// sub-millisecond) and is worth a breadcrumb in the log.
					// Classify against `entry.startTime`: the observer delivers
					// batches late, so "is a stroke open *now*" was misleading —
					// most of these land microseconds after a commit instead.
					if (entry.duration >= 100) {
						let afterCommit = Infinity;
						let busy = false;
						for (const controller of this.controllers.values()) {
							if (controller.isStroking) busy = true;
							if (controller.lastCommitAt > 0) {
								const age = entry.startTime - controller.lastCommitAt;
								if (age >= 0 && age < afterCommit) afterCommit = age;
							}
						}
						const tag =
							afterCommit < 400
								? `after-commit +${Math.round(afterCommit)}ms`
								: busy
									? "during-stroke"
									: "idle";
						this.log(`longtask ${Math.round(entry.duration)}ms ${tag}`);
					}
				}
			});
			observer.observe({ type: "longtask", buffered: true } as PerformanceObserverInit);
			this.longTaskObserver = observer;
			this.register(() => observer.disconnect());
		} catch (error) {
			// Reviewers ask for a quiet console: this is a non-fatal fallback.
		}
	}

	async onunload(): Promise<void> {
		this.layersPopover?.close();
		this.layersPopover = null;
		for (const controller of this.controllers.values()) controller.destroy();
		this.controllers.clear();
		this.lastController = null;
		this.blurShieldEl?.remove();
		this.blurShieldEl = null;
		await this.storage.flushAll();
	}

	/* ------------------------------------------------------------------ */
	/* Settings & brushes                                                  */
	/* ------------------------------------------------------------------ */

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<PdfInkSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
		if (!Array.isArray(this.settings.palette) || this.settings.palette.length === 0) {
			this.settings.palette = [...DEFAULT_SETTINGS.palette];
		}
		// dev.34/35 made highlighters translucent again; the old 0.35 default
		// reads as too faint, so bump the untouched default once.
		if (stored && stored.highlighterOpacity === 0.35) {
			this.settings.highlighterOpacity = 0.5;
		}
		if (!Array.isArray(this.settings.recentColors)) {
			this.settings.recentColors = [];
		}
		this.settings.penOpacity = Number.isFinite(this.settings.penOpacity)
			? clamp(this.settings.penOpacity, 0.05, 1)
			: 1;
		// Presets and the toolbar color row are new in dev.38: seed them from the
		// defaults once, then respect whatever the user keeps (including []).
		const storedPresets = (stored as { brushPresets?: unknown } | null)?.brushPresets;
		const seeded = storedPresets === undefined;
		const presets = (seeded ? DEFAULT_SETTINGS.brushPresets : storedPresets) as
			| PdfInkSettings["brushPresets"]
			| undefined;
		this.settings.brushPresets = {
			pen: clonePresets(presets?.pen),
			highlighter: clonePresets(presets?.highlighter),
			eraser: clonePresets(presets?.eraser),
		};
		const storedQuick = (stored as { quickColors?: unknown } | null)?.quickColors;
		this.settings.quickColors = Array.isArray(storedQuick)
			? storedQuick.filter((entry): entry is string => typeof entry === "string")
			: [...DEFAULT_SETTINGS.quickColors];
		// dev.20 stored a single `eraserMode`; split it into region + scope.
		const legacy = (stored as { eraserMode?: string } | null)?.eraserMode;
		if (legacy) {
			const map: Record<string, [EraserRegion, EraserScope]> = {
				brush: ["free", "partial"],
				rect: ["rect", "partial"],
				lasso: ["lasso", "partial"],
				stroke: ["free", "whole"],
				"stroke-pick": ["free", "whole"],
			};
			const pair = map[legacy];
			if (pair) {
				if (!stored || stored.eraserRegion === undefined) this.settings.eraserRegion = pair[0];
				if (!stored || stored.eraserScope === undefined) this.settings.eraserScope = pair[1];
			}
		}
	}

	/**
	 * Measures what a page-sized canvas actually costs in this environment.
	 * The stutter is outside our JS (our whole stroke path is 0.02 ms), so the
	 * only way to tell "canvas is slow here" from "something else is blocking"
	 * is to time the primitives directly and compare with the long tasks.
	 */
	async runCanvasBenchmark(): Promise<void> {
		const width = 1326;
		const height = 1876;
		const scratch = document.createElement("canvas");
		scratch.width = width;
		scratch.height = height;
		const ctx = scratch.getContext("2d");
		if (!ctx) return;
		const measure = (fn: () => void, reps = 5): number => {
			fn();
			const t0 = performance.now();
			for (let i = 0; i < reps; i++) fn();
			return Math.round(((performance.now() - t0) / reps) * 100) / 100;
		};
		ctx.lineWidth = 12;
		ctx.lineCap = "round";
		ctx.strokeStyle = "#e03131";
		const lines = (n: number): void => {
			ctx.beginPath();
			for (let i = 0; i < n; i++) {
				ctx.moveTo(40 + (i % 40) * 30, 60 + Math.floor(i / 40) * 60);
				ctx.lineTo(70 + (i % 40) * 30, 90 + Math.floor(i / 40) * 60);
			}
			ctx.stroke();
		};
		const linesOneByOne = (n: number): void => {
			for (let i = 0; i < n; i++) {
				ctx.beginPath();
				ctx.moveTo(40 + (i % 40) * 30, 60 + Math.floor(i / 40) * 60);
				ctx.lineTo(70 + (i % 40) * 30, 90 + Math.floor(i / 40) * 60);
				ctx.stroke();
			}
		};
		const clearFull = measure(() => ctx.clearRect(0, 0, width, height));
		const clearBox = measure(() => ctx.clearRect(100, 100, 300, 160));
		const path300 = measure(() => lines(300), 3);
		const seg300 = measure(() => linesOneByOne(300), 3);
		const blit = measure(() =>
			ctx.drawImage(scratch, 100, 100, 300, 160, 100, 100, 300, 160),
		);
		ctx.clearRect(0, 0, width, height);
		// Second half: how expensive is it to *present* a new frame after
		// drawing into a page-sized canvas? That is where the ~90 ms frame gap
		// comes from when the draw calls themselves take microseconds.
		const frameTimes: number[] = [];
		let last = 0;
		await new Promise<void>((resolve) => {
			let frames = 0;
			const step = (now: number): void => {
				if (last > 0) frameTimes.push(now - last);
				last = now;
				ctx.beginPath();
				ctx.moveTo(100 + frames * 8, 200);
				ctx.lineTo(130 + frames * 8, 240);
				ctx.stroke();
				frames++;
				if (frames >= 24) resolve();
				else requestAnimationFrame(step);
			};
			requestAnimationFrame(step);
		});
		const sorted = [...frameTimes].sort((a, b) => a - b);
		const frameP95 = Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 10) / 10;
		const frameAvg =
			Math.round((frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length) * 10) / 10;

		// Same 24-frame loop, but with the canvas mounted *inside a PDF page*,
		// over pdf.js' own canvas. `commit.toFrame` says each stroke commit waits
		// ~137 ms for the next frame while the JS costs 0.2 ms; if the same loop
		// is fast on a detached canvas and slow inside the page, the cost is
		// blending against the PDF page, not canvas work in general.
		const inPage = await this.measureFramesInPage(width, height);

		let gpu = "unknown";
		try {
			const probe = document.createElement("canvas");
			const gl =
				probe.getContext("webgl") ?? probe.getContext("experimental-webgl");
			gpu = gl ? "webgl-ok" : "no-webgl";
		} catch {
			gpu = "webgl-error";
		}
		const lines2 = `画布 ${width}x${height}（${(
			(width * height) /
			1000000
		).toFixed(1)} Mpx）· 全页 clear ${clearFull}ms · 区域 clear ${clearBox}ms · 300 段逐段 ${seg300}ms · 300 段单路径 ${path300}ms · 区域 blit ${blit}ms · 逐帧(离屏) avg ${frameAvg}ms p95 ${frameP95}ms · 逐帧(叠加在 PDF 页上) avg ${inPage.avg}ms p95 ${inPage.p95}ms · ${gpu}`;
		this.log(`benchmark ${lines2}`);
		new Notice(`[PDF Ink] ${lines2}`, 20000);
		void this.dumpDiagnostics("benchmark", true);
	}

	/** 24 frames drawn into a canvas appended to the first PDF page. */
	private async measureFramesInPage(
		width: number,
		height: number,
	): Promise<{ avg: number; p95: number }> {
		const pageEl = document.querySelector<HTMLElement>(".page[data-page-number]");
		if (!pageEl) return { avg: -1, p95: -1 };
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		canvas.style.position = "absolute";
		canvas.style.left = "0";
		canvas.style.top = "0";
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
		canvas.style.pointerEvents = "none";
		pageEl.appendChild(canvas);
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			canvas.remove();
			return { avg: -1, p95: -1 };
		}
		ctx.lineWidth = 12;
		ctx.lineCap = "round";
		ctx.strokeStyle = "#e03131";
		const gaps: number[] = [];
		let last = 0;
		await new Promise<void>((resolve) => {
			let frames = 0;
			const step = (now: number): void => {
				if (last > 0) gaps.push(now - last);
				last = now;
				ctx.beginPath();
				ctx.moveTo(100 + frames * 8, 200);
				ctx.lineTo(130 + frames * 8, 240);
				ctx.stroke();
				frames++;
				if (frames >= 24) resolve();
				else requestAnimationFrame(step);
			};
			requestAnimationFrame(step);
		});
		canvas.remove();
		const sorted = [...gaps].sort((a, b) => a - b);
		return {
			avg: Math.round((gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length)) * 10) / 10,
			p95: Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 10) / 10,
		};
	}

	/**
	 * Idle A/B: count long tasks with our ink canvases in different states.
	 * Each phase runs twice so a single stray task cannot decide the verdict.
	 * No Chrome DevTools needed — this answers "is it our canvases, and which
	 * one" on this machine.
	 */
	async runStutterAbTest(): Promise<void> {
		const controller = this.getActiveController();
		if (!controller) {
			new Notice("[PDF Ink] 请先打开一个 PDF 文件");
			return;
		}
		const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
		const sample = (ms: number): Promise<{ count: number; total: number }> =>
			new Promise((resolve) => {
				perf.reset();
				window.setTimeout(() => {
					const stat = perf.snapshot().stats["longtask"];
					resolve({ count: stat?.count ?? 0, total: Math.round(stat?.total ?? 0) });
				}, ms);
			});
		const phases: Array<{ label: string; mode: "none" | "live" | "all" }> = [
			{ label: "全部画布", mode: "none" },
			{ label: "只隐藏 live", mode: "live" },
			{ label: "隐藏全部", mode: "all" },
		];
		new Notice(
			`[PDF Ink] 归因测试：约 15 秒，全程别动笔、别滚动（当前 ${controller.canvasCount} 块画布）`,
			8000,
		);
		const results: Array<{ label: string; count: number; total: number }> = [];
		for (const phase of phases) {
			controller.setInkHidden(phase.mode);
			await wait(500);
			let count = 0;
			let total = 0;
			for (let round = 0; round < 2; round++) {
				const one = await sample(2000);
				count += one.count;
				total += one.total;
			}
			results.push({ label: phase.label, count, total });
		}
		controller.setInkHidden("none");

		const byLabel = new Map(results.map((entry) => [entry.label, entry]));
		const all = byLabel.get("全部画布")!;
		const liveHidden = byLabel.get("只隐藏 live")!;
		const noneHidden = byLabel.get("隐藏全部")!;
		let verdict: string;
		if (all.count === 0 && noneHidden.count === 0) {
			verdict = "空闲时本来就不卡 → 卡顿在操作瞬间，查提交/擦除路径";
		} else if (noneHidden.total < all.total * 0.5 && liveHidden.total < all.total * 0.7) {
			verdict = "live 层是大头 → 直接绘制（去掉 live 层）";
		} else if (noneHidden.total < all.total * 0.5) {
			verdict = "committed 层是大头 → 降预算或分块渲染";
		} else {
			verdict = "隐藏画布没区别 → 阻塞来自外部（pdf.js / 其他插件），需要二分关插件";
		}
		const detail = results
			.map((entry) => `${entry.label} ${entry.count} 次/${entry.total}ms`)
			.join(" · ");
		const line = `归因: ${detail} · ${verdict}`;
		this.log(`stutter-ab ${line}`);
		new Notice(`[PDF Ink] ${line}`, 30000);
		void this.dumpDiagnostics("stutter-ab", true);
	}

	/**
	 * PERF: a blurred (backdrop-filter) overlay above the PDF makes Chromium
	 * re-rasterize the blur on every pen sample — 100 ms+ long tasks per stroke.
	 * dev.44 toggled it off for the duration of a stroke, which worked but paid
	 * two re-rasters per stroke for the toggle itself; dev.62 removed it and
	 * made writing visibly worse. So it is applied once at load and only ever
	 * removed when the user turns it off.
	 *
	 * Scoped to the known offenders instead of `.workspace-leaf *`: restyling
	 * the whole tree would cost more than it saves.
	 */
	applyBlurShield(): void {
		this.blurShieldEl?.remove();
		this.blurShieldEl = null;
		if (!this.settings.blurShield) return;
		const style = document.createElement("style");
		style.id = "pdf-ink-blur-shield";
		style.textContent = [
			":is(#editingToolbarModalBar, #editingToolbarPopoverBar) {",
			"\tbackdrop-filter: none !important;",
			"\t-webkit-backdrop-filter: none !important;",
			"}",
			":is(#editingToolbarModalBar, #editingToolbarPopoverBar) *::before,",
			":is(#editingToolbarModalBar, #editingToolbarPopoverBar) *::after {",
			"\tbackdrop-filter: none !important;",
			"\t-webkit-backdrop-filter: none !important;",
			"}",
		].join("\n");
		document.head.appendChild(style);
		this.blurShieldEl = style;
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.refreshUI();
	}

	/**
	 * Canvas pixel budget per overlay. The blocking time after every commit
	 * scales with the canvas area (measured: 10 Mpx ≈ 190 ms/stroke, 4 Mpx ≈
	 * 100 ms), so this is the one knob that actually moves the needle.
	 */
	applyInkQuality(): void {
		const budgets: Record<string, number> = {
			fast: 1_200_000,
			smooth: 2_400_000,
			balanced: 4_000_000,
			crisp: 8_000_000,
		};
		setCanvasPixelBudget(budgets[this.settings.inkQuality] ?? 4_000_000);
		setLowLatencyLive(Boolean(this.settings.lowLatencyLive));
		// Existing overlays only resize on the next measure pass.
		for (const controller of this.controllers.values()) controller.refreshLayout();
	}

	private scheduleSaveSettings(): void {
		if (this.settingsTimer !== null) window.clearTimeout(this.settingsTimer);
		this.settingsTimer = window.setTimeout(() => {
			this.settingsTimer = null;
			void this.saveSettings();
		}, 300);
	}

	brushFor(tool: ToolName): Brush {
		if (tool === "highlighter") {
			return {
				color: this.settings.highlighterColor,
				widthPx: this.settings.highlighterWidth,
				opacity: this.settings.highlighterOpacity,
			};
		}
		if (tool === "eraser") {
			return {
				color: "#000000",
				widthPx: this.settings.eraserWidth,
				opacity: 1,
			};
		}
		return {
			color: this.settings.penColor,
			widthPx: this.settings.penWidth,
			opacity: this.settings.penOpacity,
		};
	}

	/** Which brush a preset kind edits (the eraser has no color). */
	applyInputMode(mode: "auto" | "touch" | "tablet"): Promise<void> {
		this.settings.inputMode = mode;
		if (mode === "tablet") {
			// Screenless tablet: the pen is on the desk, the eye is on the
			// screen, so "rest the pen and wait" is invisible and misfires.
			this.settings.eraserHoldEnabled = false;
			this.settings.tapGestureMenuEnabled = false;
			this.settings.eraserHoldMs = Math.max(this.settings.eraserHoldMs, 1200);
			if (!this.settings.tempEraserKey.trim()) this.settings.tempEraserKey = "f";
		} else if (mode === "touch") {
			this.settings.eraserHoldEnabled = true;
			this.settings.tapGestureMenuEnabled = true;
			this.settings.eraserHoldMs = Math.min(this.settings.eraserHoldMs, 750);
		}
		return this.saveSettings();
	}

	setTool(tool: ToolName): void {
		if (!this.applyingTemp && this.tempTool) {
			// The user picked a tool on purpose, so the "hold" override loses;
			// the mouse channel also stops re-arming until the button is freed.
			if (this.tempTool.channel === "mouse") this.tempSuppressed = true;
			this.tempTool = null;
		}
		// An explicit tool choice also cancels a latched restore.
		if (!this.applyingTemp) this.pendingTempRestore = null;
		this.tool = tool;
		this.refreshUI();
		for (const controller of this.controllers.values()) controller.onToolChanged();
	}

	/* ------------------------------------------------------------------ */
	/* Temporary eraser (pen tablet "hold" keys / side buttons)            */
	/* ------------------------------------------------------------------ */

	/** PointerEvent.buttons bit for the side button the driver reports. */
	private get mouseEraserMask(): number {
		const mode = this.settings.tempEraserMouse;
		if (mode === "right") return 2;
		if (mode === "middle") return 4;
		return 0;
	}

	private isTempEraserKey(event: KeyboardEvent): boolean {
		const spec = this.settings.tempEraserKey?.trim();
		if (!spec) return false;
		return matchesSpec(spec, event);
	}

	/**
	 * Switches to `tool` for as long as the trigger stays down.
	 *
	 * Two callers: the dedicated hold key (`tempEraserKey`) and any tool action
	 * whose binding is set to "按住" in the settings. `spec` is the spec that
	 * armed it, so the matching keyup can end it even if modifiers changed.
	 */
	beginTempTool(tool: ToolName, channel: "key" | "mouse", spec?: string): void {
		if (this.tempTool) return;
		if (channel === "mouse" && this.tempSuppressed) return;
		const controller = this.getActiveController();
		// Switching tools mid-stroke would leave a half-erased stroke behind and
		// the session would never see its own tool change.
		if (controller?.isStroking) return;
		const prev = this.tool;
		this.tempTool = { prev, channel, spec };
		if (prev === tool) return;
		this.applyingTemp = true;
		this.setTool(tool);
		this.applyingTemp = false;
		this.log(
			`temp tool ${tool} on (${channel}) from ${prev}${spec ? ` via ${spec}` : ""}`,
		);
	}

	endTempTool(channel?: "key" | "mouse"): void {
		const state = this.tempTool;
		if (!state) return;
		if (channel && state.channel !== channel) return;
		this.tempTool = null;
		// Releasing the side button in the middle of a stroke must NOT switch
		// the tool: the driver keeps delivering moves for the same press, and a
		// pen tool there paints a trail wherever the hand is still travelling.
		// Latch until the pen is actually up (Photoshop does the same).
		if (state.channel === "key" && (this.penDown || this.isAnySessionOpen())) {
			this.pendingTempRestore = { prev: state.prev };
			this.log(`temp tool release deferred until pen up (${state.prev})`);
			return;
		}
		this.applyTempRestore(state.prev);
	}

	private applyTempRestore(prev: ToolName): void {
		if (prev === this.tool) return;
		this.applyingTemp = true;
		this.setTool(prev);
		this.applyingTemp = false;
		this.log(`temp tool off back to ${prev}`);
	}

	private isAnySessionOpen(): boolean {
		for (const controller of this.controllers.values()) {
			if (controller.isStroking) return true;
		}
		return false;
	}

	/* ------------------------------------------------------------------ */
	/* Pen-only brush adjustment (Shift + move the pen above the page)     */
	/* ------------------------------------------------------------------ */

	private shiftAdjust: {
		x: number;
		y: number;
		size: number;
		opacity: number;
	} | null = null;
	private shiftHud: HTMLElement | null = null;
	private shiftRaf = 0;

	/**
	 * Photoshop / Krita muscle memory: hold Shift and move the pen *without*
	 * touching the page — horizontal changes the brush size, vertical changes
	 * the opacity. Refuses to run while the tip is down or a session is open,
	 * so it can never fight a stroke, a selection or a pan.
	 */
	private handlePenAdjust = (event: PointerEvent): void => {
		const inkTool = this.tool === "pen" || this.tool === "highlighter";
		// Adjustment needs actual contact with the page (the pen must be down):
		// hovering with Shift does nothing, which is what a tablet user expects.
		// Shift *is* the adjust gesture for ink tools, so a stroke never starts
		// while it is held — otherwise resizing the brush also paints.
		if (
			!inkTool ||
			!event.shiftKey ||
			!this.penDown ||
			this.isAnySessionOpen()
		) {
			if (this.shiftAdjust) this.endShiftAdjust();
			return;
		}
		const kind: BrushKind = this.tool === "highlighter" ? "highlighter" : "pen";
		if (!this.shiftAdjust) {
			const brush = this.brushFor(kind);
			this.shiftAdjust = {
				x: event.clientX,
				y: event.clientY,
				size: brush.widthPx,
				opacity: brush.opacity,
			};
			this.showShiftHud(event.clientX, event.clientY, brush.widthPx, brush.opacity);
			return;
		}
		const speed = Math.max(1, Math.min(10, this.settings.penAdjustSpeed)) * 0.12;
		const dx = event.clientX - this.shiftAdjust.x;
		const dy = event.clientY - this.shiftAdjust.y;
		const size = clamp(this.shiftAdjust.size + dx * speed, 0.5, 64);
		const opacity = clamp(this.shiftAdjust.opacity - dy * speed * 0.02, 0.05, 1);
		this.positionShiftHud(event.clientX, event.clientY, size, opacity);
		if (this.shiftRaf) return;
		this.shiftRaf = window.requestAnimationFrame(() => {
			this.shiftRaf = 0;
			this.setBrushWidth(kind, Math.round(size * 10) / 10);
			this.setBrushOpacity(kind, Math.round(opacity * 100) / 100);
			// Crossing the thin/thick threshold must swap the cursor even
			// though no hover event is running while the tip is down.
			this.getActiveController()?.refreshCursor(event);
		});
	};

	/** True while Shift + pen movement is resizing the brush. */
	adjustingBrush(): boolean {
		return Boolean(this.shiftAdjust);
	}

	private showShiftHud(x: number, y: number, size: number, opacity: number): void {
		this.shiftHud?.remove();
		// Appended to <body>, not to the PDF container: a `position: fixed` box
		// inside a transformed ancestor (Obsidian's view content) resolves
		// against that ancestor, which is why the read-out used to float far
		// away from the pen tip.
		const hud = document.createElement("div");
		hud.className = "pdf-ink-shift-hud";
		document.body.appendChild(hud);
		this.shiftHud = hud;
		this.positionShiftHud(x, y, size, opacity);
	}

	private positionShiftHud(x: number, y: number, size: number, opacity: number): void {
		const hud = this.shiftHud;
		if (!hud) return;
		hud.textContent = `粗细 ${Math.round(size * 10) / 10}px · 不透明度 ${Math.round(
			opacity * 100,
		)}%`;
		// Next to the tip, but pushed out just enough to clear the brush ring so
		// the cursor itself is never covered. Flips to the other side (and is
		// clamped) near a viewport edge.
		const w = hud.offsetWidth || 168;
		const h = hud.offsetHeight || 26;
		const gap = 14 + Math.min(28, Math.max(0, size * 0.35));
		const maxLeft = Math.max(8, window.innerWidth - w - 8);
		const maxTop = Math.max(8, window.innerHeight - h - 8);
		let left = x + gap;
		let top = y + gap;
		if (left > maxLeft) left = x - gap - w;
		if (top > maxTop) top = y - gap - h;
		hud.style.left = `${Math.round(clamp(left, 8, maxLeft))}px`;
		hud.style.top = `${Math.round(clamp(top, 8, maxTop))}px`;
	}

	private endShiftAdjust(): void {
		this.shiftAdjust = null;
		if (this.shiftRaf) {
			window.cancelAnimationFrame(this.shiftRaf);
			this.shiftRaf = 0;
		}
		this.shiftHud?.remove();
		this.shiftHud = null;
	}

	/** True while a just-released hold gesture must not start a new stroke. */
	strokeBlocked(): boolean {
		return performance.now() < this.strokeGuardUntil;
	}

	/** Pen state tracker: the deferred restore lands when the tip leaves. */
	private trackPenState = (event: PointerEvent): void => {
		// Mouse counts too: a hold key on a plain desktop setup has exactly the
		// same "released mid-stroke" problem, and touch never draws here.
		if (event.pointerType === "touch") return;
		const down = (event.buttons & 1) !== 0;
		const was = this.penDown;
		this.penDown = down;
		if (was && !down) {
			// Lifting the pen ends a brush adjustment (the HUD must not linger).
			this.endShiftAdjust();
			this.flushPendingTempRestore();
		}
	};

	private flushPendingTempRestore(): void {
		const pending = this.pendingTempRestore;
		if (!pending) return;
		this.pendingTempRestore = null;
		this.applyTempRestore(pending.prev);
		// Drivers that synthesise a pointerup on side-button release report the
		// tip as up while it is still travelling; block ink for a beat so the
		// tail of that movement cannot paint a stroke.
		this.strokeGuardUntil = performance.now() + HOLD_RELEASE_GUARD_MS;
		this.log(`hold release guard ${HOLD_RELEASE_GUARD_MS}ms`);
	}

	/** True when the keyup belongs to whatever armed the current hold. */
	private keyReleasedTempTool(event: KeyboardEvent): boolean {
		const state = this.tempTool;
		if (!state || state.channel !== "key") return false;
		const armed = parseKeySpec(state.spec ?? this.settings.tempEraserKey ?? "");
		if (!armed) return false;
		// Compare the key only: the user may let go of Shift before the key.
		const released = parseKeySpec(specFromEvent(event));
		return !!released && released.key === armed.key;
	}

	private syncMouseTempEraser = (event: PointerEvent): void => {
		const mask = this.mouseEraserMask;
		if (!mask) {
			if (this.tempTool?.channel === "mouse") this.endTempTool("mouse");
			return;
		}
		if (event.pointerType !== "pen") return;
		if ((event.buttons & mask) !== 0) {
			if (!this.tempTool && !this.tempSuppressed) {
				this.beginTempTool("eraser", "mouse");
			}
			return;
		}
		this.tempSuppressed = false;
		if (this.tempTool?.channel === "mouse") this.endTempTool("mouse");
	};

	private actionForSpec(spec: string): string | null {
		return actionIdForSpec(spec, resolveBindings(this.settings.keyBindings));
	}

	private runAction(actionId: string): void {
		const action = ACTIONS.find((entry) => entry.id === actionId);
		if (!action) return;
		if (action.tool) {
			this.setTool(action.tool);
			return;
		}
		if (typeof action.colorIndex === "number") this.setPaletteColor(action.colorIndex);
	}

	/** Color of the pen / highlighter, regardless of the active tool. */
	setBrushColor(kind: BrushKind, color: string): void {
		if (kind === "highlighter") this.settings.highlighterColor = color;
		else this.settings.penColor = color;
		this.settings.recentColors = [
			color,
			...this.settings.recentColors.filter((entry) => entry !== color),
		].slice(0, 8);
		this.refreshUI();
		this.scheduleSaveSettings();
	}

	setColor(color: string): void {
		this.setBrushColor(this.tool === "highlighter" ? "highlighter" : "pen", color);
	}

	/** Width of a specific brush, used by the panel sliders and presets. */
	setBrushWidth(kind: PresetKind, widthPx: number): void {
		if (kind === "highlighter") this.settings.highlighterWidth = widthPx;
		else if (kind === "eraser") this.settings.eraserWidth = widthPx;
		else this.settings.penWidth = widthPx;
		this.refreshUI();
		this.scheduleSaveSettings();
	}

	setWidth(widthPx: number): void {
		const kind = this.tool === "eraser" ? "eraser" : this.tool === "highlighter" ? "highlighter" : "pen";
		this.setBrushWidth(kind, widthPx);
	}

	setBrushOpacity(kind: BrushKind, opacity: number): void {
		const value = clamp(opacity, 0.05, 1);
		if (kind === "highlighter") this.settings.highlighterOpacity = value;
		else this.settings.penOpacity = value;
		this.refreshUI();
		this.scheduleSaveSettings();
	}

	setPaletteColor(index: number): void {
		const color = this.settings.palette[index];
		if (color) this.setColor(color);
	}

	/* ------------------------------------------------------------------ */
	/* Brushes: presets, palette, quick colors                             */
	/* ------------------------------------------------------------------ */

	private newId(prefix: string): string {
		return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
	}

	presetsOf(kind: PresetKind): Array<BrushPreset | EraserPreset> {
		if (kind === "eraser") return this.settings.brushPresets.eraser;
		return this.settings.brushPresets[kind];
	}

	/** Applies a preset: one click sets color, width (and opacity) together. */
	applyPreset(kind: PresetKind, preset: BrushPreset | EraserPreset): void {
		if (kind === "eraser") {
			const eraser = preset as EraserPreset;
			this.settings.eraserRegion = eraser.region;
			this.settings.eraserScope = eraser.scope;
			this.settings.eraserWidth = eraser.widthPx;
			this.setTool("eraser");
		} else {
			const brush = preset as BrushPreset;
			this.setBrushColor(kind, brush.color);
			this.setBrushWidth(kind, brush.widthPx);
			this.setBrushOpacity(kind, brush.opacity);
			if (this.tool !== kind) this.setTool(kind);
		}
		this.refreshUI();
		this.scheduleSaveSettings();
	}

	/** Stores the current brush state as a new preset and returns it. */
	addPreset(kind: PresetKind): BrushPreset | EraserPreset {
		if (kind === "eraser") {
			const preset: EraserPreset = {
				id: this.newId("e"),
				name: eraserPresetName(this.settings.eraserRegion, this.settings.eraserWidth),
				region: this.settings.eraserRegion,
				scope: this.settings.eraserScope,
				widthPx: this.settings.eraserWidth,
			};
			this.settings.brushPresets.eraser.push(preset);
			this.scheduleSaveSettings();
			return preset;
		}
		const brush = this.brushFor(kind);
		const preset: BrushPreset = {
			id: this.newId(kind === "pen" ? "p" : "h"),
			name: autoPresetName(brush.color, brush.widthPx),
			color: brush.color,
			widthPx: brush.widthPx,
			opacity: brush.opacity,
		};
		this.settings.brushPresets[kind].push(preset);
		this.scheduleSaveSettings();
		return preset;
	}

	/** Replaces a preset with the current brush state (long press → 覆盖). */
	overwritePreset(kind: PresetKind, id: string): void {
		const list = this.presetsOf(kind);
		const preset = list.find((entry) => entry.id === id);
		if (!preset) return;
		if (kind === "eraser") {
			const eraser = preset as EraserPreset;
			eraser.region = this.settings.eraserRegion;
			eraser.scope = this.settings.eraserScope;
			eraser.widthPx = this.settings.eraserWidth;
		} else {
			const brush = preset as BrushPreset;
			const current = this.brushFor(kind);
			brush.color = current.color;
			brush.widthPx = current.widthPx;
			brush.opacity = current.opacity;
		}
		this.refreshUI();
		this.scheduleSaveSettings();
	}

	renamePreset(kind: PresetKind, id: string, name: string): void {
		const preset = this.presetsOf(kind).find((entry) => entry.id === id);
		if (!preset) return;
		const trimmed = name.trim();
		if (trimmed.length === 0) return;
		preset.name = trimmed.slice(0, 24);
		this.scheduleSaveSettings();
	}

	deletePreset(kind: PresetKind, id: string): void {
		const list: Array<{ id: string }> = this.presetsOf(kind);
		const index = list.findIndex((entry) => entry.id === id);
		if (index < 0) return;
		list.splice(index, 1);
		this.refreshUI();
		this.scheduleSaveSettings();
	}

	setPaletteSlot(index: number, color: string): void {
		if (index < 0 || index >= this.settings.palette.length) return;
		this.settings.palette[index] = color;
		this.refreshUI();
		this.scheduleSaveSettings();
	}

	addPaletteColor(color: string): void {
		if (this.settings.palette.includes(color)) return;
		this.settings.palette.push(color);
		this.refreshUI();
		this.scheduleSaveSettings();
	}

	removePaletteColor(index: number): void {
		if (this.settings.palette.length <= 1) return;
		this.settings.palette.splice(index, 1);
		this.refreshUI();
		this.scheduleSaveSettings();
	}

	/** Long press on a quick-color swatch: replace it with the current color. */
	setQuickColor(index: number, color: string): void {
		if (index < 0 || index >= this.settings.quickColors.length) return;
		this.settings.quickColors[index] = color;
		this.refreshUI();
		this.scheduleSaveSettings();
	}

	setEraserRegion(region: EraserRegion): void {
		this.settings.eraserRegion = region;
		this.refreshUI();
		this.scheduleSaveSettings();
	}

	setEraserScope(scope: EraserScope): void {
		this.settings.eraserScope = scope;
		this.refreshUI();
		this.scheduleSaveSettings();
	}

	setSelectMode(mode: "rect" | "lasso"): void {
		this.settings.selectMode = mode;
		this.refreshUI();
		this.scheduleSaveSettings();
	}

	cycleToolbarLayout(): void {
		const order = ["horizontal", "vertical", "square"] as const;
		const index = order.indexOf(this.settings.toolbarLayout);
		this.settings.toolbarLayout = order[(index + 1) % order.length];
		this.refreshUI();
		this.scheduleSaveSettings();
	}

	setToolbarPosition(position: { x: number; y: number } | null): void {
		this.settings.toolbarPos = position;
		this.scheduleSaveSettings();
	}

	log(message: string): void {
		this.logLines.push(`${new Date().toISOString()} ${message}`);
		if (this.logLines.length > 300) this.logLines.splice(0, this.logLines.length - 300);
	}

	/** Community plugins that are actually loaded (diagnostics only). */
	private enabledPluginIds(): string[] {
		try {
			const registry = (this.app as unknown as {
				plugins?: { plugins?: Record<string, unknown> };
			}).plugins?.plugins;
			if (!registry) return [];
			return Object.keys(registry).filter((id) => Boolean(registry[id])).sort();
		} catch {
			return [];
		}
	}

	async dumpDiagnostics(reason: string, force = false): Promise<void> {
		const now = Date.now();
		if (!force && now - this.lastDump < 3000) return;
		this.lastDump = now;
		const leaves = this.app.workspace.getLeavesOfType("pdf").map((leaf) => {
			const view = leaf.view as any;
			return {
				file: view?.file?.path ?? null,
				viewType: view?.getViewType?.(),
				hasPdfViewer: Boolean(view?.pdfViewer),
				domKeys: view?.pdfViewer?.dom ? Object.keys(view.pdfViewer.dom) : [],
			};
		});
		const report = {
			reason,
			time: new Date().toISOString(),
			obsidianVersion: (this.app as any).version ?? null,
			pluginVersion: this.manifest?.version ?? "unknown",
			/** enabled community plugins, so a slow session can be blamed */
			plugins: this.enabledPluginIds(),
			settings: this.settings,
			leaves,
			controllers: [...this.controllers.values()].map((controller) =>
				controller.debugInfo(),
			),
			perf: perf.snapshot(),
			log: this.logLines.slice(-150),
		};
		const dir = this.manifest?.dir || ".obsidian/plugins/pdf-ink";
		try {
			await this.app.vault.adapter.write(
				`${dir}/debug.json`,
				JSON.stringify(report, null, 2),
			);
		} catch (error) {
			console.error("[pdf-ink] failed to write diagnostics", error);
		}
	}

	/* ------------------------------------------------------------------ */
	/* Views                                                               */
	/* ------------------------------------------------------------------ */

	private scanLeaves(): void {
		const leaves = this.app.workspace.getLeavesOfType("pdf");
		for (const leaf of leaves) {
			const view = leaf.view as any;
			if (!view || view.getViewType?.() !== "pdf") continue;
			const existing = this.controllers.get(leaf);
			if (existing) existing.attach();
			else {
				this.attachLeaf(leaf);
				if (!this.autoDumpScheduled) {
					this.autoDumpScheduled = true;
					window.setTimeout(() => {
						void this.dumpDiagnostics("first-pdf", true);
					}, 2500);
				}
			}
		}
		for (const [leaf, controller] of [...this.controllers]) {
			const view = leaf.view as any;
			const connected = (view?.containerEl as HTMLElement | undefined)?.isConnected;
			if (!view || view.getViewType?.() !== "pdf" || !connected) {
				controller.destroy();
				this.controllers.delete(leaf);
				if (this.lastController === controller) this.lastController = null;
			}
		}
	}

	private attachLeaf(leaf: WorkspaceLeaf): PdfInkController | null {
		const view = leaf.view as any;
		if (!view || view.getViewType?.() !== "pdf") return null;
		const controller = new PdfInkController(this, leaf);
		this.controllers.set(leaf, controller);
		controller.attach();
		return controller;
	}

	private trackActive(): void {
		const controller = this.getActiveController();
		if (controller) this.lastController = controller;
	}

	getActiveController(): PdfInkController | null {
		// Resolve the active leaf from the DOM first: `.workspace-leaf.mod-active`
		// is what Obsidian itself styles, and the review guidelines ask plugins to
		// avoid `workspace.activeLeaf`. The old property stays as a last-resort
		// fallback for environments where the DOM lookup fails (e.g. tests).
		const leaf = this.activeLeafViaDom() ?? this.app.workspace.activeLeaf ?? null;
		if (!leaf) return null;
		const view = leaf.view as any;
		if (view?.getViewType?.() !== "pdf") return null;
		const existing = this.controllers.get(leaf) ?? this.attachLeaf(leaf);
		if (existing?.isAlive) {
			this.lastController = existing;
			return existing;
		}
		return null;
	}

	/** The workspace leaf whose DOM is currently marked active, if resolvable. */
	private activeLeafViaDom(): WorkspaceLeaf | null {
		if (typeof document === "undefined") return null;
		const activeEl = document.querySelector<HTMLElement>(".workspace-leaf.mod-active");
		if (!activeEl) return null;
		const workspace: any = this.app.workspace;
		if (typeof workspace.iterateAllLeaves !== "function") return null;
		let found: WorkspaceLeaf | null = null;
		workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			if (found) return;
			const container = (leaf.view as any)?.containerEl as HTMLElement | undefined;
			if (container && (container === activeEl || container.contains(activeEl))) {
				found = leaf;
			}
		});
		return found;
	}

	/** Active PDF controller, or the most recent one (for the sidebar panel). */
	getTargetController(): PdfInkController | null {
		const active = this.getActiveController();
		if (active) return active;
		if (this.lastController?.isAlive) return this.lastController;
		return null;
	}

	private findControllerByContainer(container: Element): PdfInkController | null {
		for (const controller of this.controllers.values()) {
			if (controller.containerEl?.contains(container)) return controller;
		}
		return null;
	}

	refreshLayouts(): void {
		for (const controller of this.controllers.values()) controller.refreshLayout();
	}

	refreshUI(): void {
		for (const controller of this.controllers.values()) controller.refreshToolbar();
	}

	/** Floating layers panel; also keeps the docked view available as a fallback. */
	toggleLayersPanel(anchor: HTMLElement | null = null): void {
		this.layersPopover ??= new PdfInkLayersPopover(this);
		this.layersPopover.toggle(anchor);
	}

	async openLayersView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_LAYERS);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: VIEW_TYPE_LAYERS, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	toggleDrawing(): void {
		const controller = this.getActiveController() ?? this.getTargetController();
		if (!controller) {
			new Notice("[PDF Ink] 请先打开一个 PDF 文件");
			return;
		}
		if (!controller.hasViewer) {
			new Notice("[PDF Ink] PDF 正在加载，请稍后再试");
			return;
		}
		controller.toggleDrawing();
	}

	/* ------------------------------------------------------------------ */
	/* Global pointer / keyboard                                           */
	/* ------------------------------------------------------------------ */

	private handleGlobalPointerDown = (event: PointerEvent): void => {
		const rawTarget = event.target as HTMLElement | null;
		if (event.pointerType === "pen" || rawTarget?.closest?.(".pdf-container")) {
			this.log(
				`raw pointer type=${event.pointerType} id=${event.pointerId} btn=${
					event.button
				} b=${event.buttons} alt=${event.altKey} target=${
					rawTarget?.className || rawTarget?.tagName || "?"
				}`,
			);
		}
		if (
			!this.settings.stylusFreehand &&
			!this.settings.mouseFreehand &&
			this.tool !== "hand"
		) {
			return;
		}
		const isPen = event.pointerType === "pen";
		const isMouse = event.pointerType === "mouse";
		// The hand tool is explicit: it must work with the mouse even when
		// "mouse freehand" is off, otherwise "drag the page" reads as dead.
		const hand = this.tool === "hand";
		if (!isPen && !(isMouse && (this.settings.mouseFreehand || hand))) return;
		// Alt hands the page back to text selection / links — but only in the
		// select tool, and it has to work for the pen too.
		this.syncAlt(event.altKey);
		if (event.altKey && this.tool === "select") return;
		// Shift resizes the brush for ink tools, so it must not paint.
		if (
			event.shiftKey &&
			(this.tool === "pen" || this.tool === "highlighter")
		) {
			return;
		}
		if (event.altKey || event.button !== 0) return;
		const target = event.target as HTMLElement | null;
		if (!target?.closest) return;
		if (
			target.closest(
				".pdf-ink-toolbar, .pdf-toolbar, .pdf-plus-color-palette, .modal, .menu, .prompt",
			)
		) {
			return;
		}
		const pageEl = target.closest<HTMLElement>(".page[data-page-number]");
		this.log(`pointer type=${event.pointerType} target=${target.className || target.tagName}`);
		if (!pageEl) {
			this.log("pointer: no .page[data-page-number] in target chain");
			return;
		}
		const container = target.closest(".pdf-container");
		if (!container) {
			this.log("pointer: no .pdf-container in target chain");
			return;
		}
		const controller = this.findControllerByContainer(container);
		if (!controller) {
			this.log("pointer: no controller for this container");
			return;
		}
		if (controller.drawing) return;

		// Tail of a just-released hold gesture: the driver says the tip is up
		// while it is still travelling, and painting there leaves a stray line.
		if (this.strokeBlocked()) {
			this.log("stroke blocked (hold release guard)");
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
		const started = controller.beginExternalStroke(event, pageEl);
		this.log(
			`pointer: page=${pageEl.dataset.pageNumber} doc=${Boolean(
				controller.doc,
			)} started=${started}`,
		);
	};

	private registerCommands(): void {
		this.addCommand({
			id: "toggle-drawing",
			name: "开启/关闭绘制模式",
			checkCallback: (checking) => {
				const controller = this.getActiveController();
				if (!controller || !controller.hasViewer) return false;
				if (!checking) controller.toggleDrawing();
				return true;
			},
		});
		const tools: Array<[string, string, ToolName]> = [
			["tool-pen", "工具：钢笔", "pen"],
			["tool-highlighter", "工具：荧光笔", "highlighter"],
			["tool-eraser", "工具：橡皮", "eraser"],
			["tool-select", "工具：选择", "select"],
			["tool-line", "工具：直线", "line"],
			["tool-arrow", "工具：箭头", "arrow"],
			["tool-rect", "工具：矩形", "rect"],
			["tool-ellipse", "工具：椭圆", "ellipse"],
			["tool-hand", "工具：拖拽页面", "hand"],
		];
		for (const [id, name, tool] of tools) {
			this.addCommand({ id, name, callback: () => this.setTool(tool) });
		}
		this.addCommand({
			id: "undo-stroke",
			name: "撤销笔迹",
			callback: () => this.getTargetController()?.undo(),
		});
		this.addCommand({
			id: "redo-stroke",
			name: "重做笔迹",
			callback: () => this.getTargetController()?.redo(),
		});
		this.addCommand({
			id: "clear-all-ink",
			name: "清空本 PDF 的全部墨迹（不可撤销）",
			// Plain callback on purpose: a `checkCallback` that returns false is
			// hidden from the palette, and while the palette itself is open the
			// active leaf is not always the PDF view — the command then silently
			// disappeared. Report the problem instead of hiding.
			callback: () => {
				const controller = this.getActiveController() ?? this.getTargetController();
				if (!controller?.doc) {
					new Notice("[PDF Ink] 请先打开一个 PDF 文件并等它加载完");
					return;
				}
				const strokes = controller.doc.layers.reduce(
					(sum, layer) => sum + layer.strokes.length,
					0,
				);
				new ConfirmModal(
					this.app,
					"清空墨迹",
					`将从《${controller.doc.file ?? "当前 PDF"}》删除全部 ${strokes} 条笔迹（图层保留）。删除前会写一份 .bak 备份，删除后无法撤销。`,
					"清空墨迹",
					() => {
						const removed = controller.clearAllInk();
						new Notice(
							removed > 0
								? `[PDF Ink] 已清空 ${removed} 条笔迹`
								: "[PDF Ink] 没有可清空的笔迹",
						);
					},
				).open();
			},
		});
		this.addCommand({
			id: "reset-input",
			name: "重置笔迹会话（笔卡住时用）",
			checkCallback: (checking) => {
				const controller = this.getTargetController();
				if (!controller) return false;
				if (!checking) {
					this.endTempTool();
					this.tempSuppressed = false;
					this.pendingTempRestore = null;
					this.penDown = false;
					this.strokeGuardUntil = 0;
					controller.resetInputState();
					this.setTool("pen");
					new Notice("[PDF Ink] 已重置：会话关闭、临时工具撤销、工具回到钢笔");
				}
				return true;
			},
		});
		this.addCommand({
			id: "new-layer",
			name: "新建图层",
			callback: () => {
				const controller = this.getTargetController();
				if (!controller?.doc) {
					new Notice("[PDF Ink] 请先打开一个 PDF 文件");
					return;
				}
				controller.addLayer();
			},
		});
		this.addCommand({
			id: "open-layers",
			name: "打开图层面板",
			callback: () => this.toggleLayersPanel(this.getTargetController()?.toolbarEl ?? null),
		});
		this.addCommand({
			id: "export-diagnostics",
			name: "导出诊断信息（调试用）",
			callback: () => {
				void this.dumpDiagnostics("manual", true).then(() => {
					new Notice("[PDF Ink] 诊断信息已写入插件目录 debug.json");
				});
			},
		});
		this.addCommand({
			id: "perf-summary",
			name: "显示性能摘要（调试用）",
			callback: () => {
				const lines = perf.summary(10);
				if (lines.length === 0) {
					new Notice("[PDF Ink] 还没有性能采样：先写几笔再试");
					return;
				}
				const text = lines.join("\n");
				void navigator.clipboard?.writeText(text).catch(() => undefined);
				new Notice(`[PDF Ink] ${text}`, 15000);
			},
		});
		this.addCommand({
			id: "canvas-benchmark",
			name: "画布基准测试（排查卡顿用）",
			callback: () => {
				void this.runCanvasBenchmark();
			},
		});
		this.addCommand({
			id: "stutter-ab",
			name: "卡顿归因测试（8 秒，A/B 画布）",
			checkCallback: (checking) => {
				const controller = this.getActiveController();
				if (!controller) return false;
				if (!checking) void this.runStutterAbTest();
				return true;
			},
		});
		this.addCommand({
			id: "perf-reset",
			name: "清空性能采样",
			callback: () => {
				perf.reset();
				new Notice("[PDF Ink] 性能采样已清空");
			},
		});
	}

	private syncAlt(active: boolean): void {
		for (const controller of this.controllers.values()) {
			controller.setAltPassthrough(active);
		}
	}

	private handleKeyDown(event: KeyboardEvent): void {
		this.syncAlt(event.altKey);
		const target = event.target as HTMLElement | null;
		const keySpec = specFromEvent(event);
		// Raw evidence for "what does the pen driver actually send" — the only
		// way to tell a keyboard-mapped side button from a driver-internal one.
		// Logged before the input guard on purpose: a side button pressed while
		// the focus sits in the colour picker still has to show up here.
		if (this.settings.logKeyEvents) {
			const tag = target?.tagName ? `<${target.tagName.toLowerCase()}>` : "";
			this.log(`key down ${keySpec || event.key} ${tag}`.trim());
		}
		if (
			target &&
			(target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable)
		) {
			return;
		}
		const controller = this.getActiveController();
		if (!controller) return;

		// Clipboard and delete work whenever something is selected, even when the
		// pen owns the page.
		if ((event.ctrlKey || event.metaKey) && !event.altKey) {
			const key = event.key.toLowerCase();
			if (key === "c" && controller.hasSelection) {
				if (controller.copySelection()) {
					this.log(`key ctrl+c handled selection`);
					event.preventDefault();
					return;
				}
			}
			if (key === "x" && controller.hasSelection) {
				if (controller.cutSelection()) {
					this.log(`key ctrl+x handled selection`);
					event.preventDefault();
					return;
				}
			}
			if (key === "a" && controller.selectAll()) {
				this.log(`key ctrl+a select all`);
				event.preventDefault();
				return;
			}
			if (key === "v") {
				if (controller.pasteClipboard()) {
					this.log(`key ctrl+v pasted`);
					event.preventDefault();
					return;
				}
				this.log(
					`key ctrl+v ignored clipboard=${this.inkClipboard ? this.inkClipboard.strokes.length : 0}`,
				);
			}
		}
		if (
			(event.key === "Delete" || event.key === "Backspace") &&
			controller.hasSelection
		) {
			event.preventDefault();
			controller.deleteSelection();
			return;
		}
		// Arrow keys nudge the selected ink: 1px, or 10px with Shift.
		if (controller.hasSelection && !event.ctrlKey && !event.metaKey && !event.altKey) {
			const direction: Record<string, [number, number]> = {
				ArrowLeft: [-1, 0],
				ArrowRight: [1, 0],
				ArrowUp: [0, -1],
				ArrowDown: [0, 1],
			};
			const step = direction[event.key];
			if (step) {
				const amount = event.shiftKey ? 10 : 1;
				if (controller.nudgeSelection(step[0] * amount, step[1] * amount)) {
					event.preventDefault();
					return;
				}
			}
		}

		const active = controller.drawing || this.settings.stylusFreehand;

		if (event.key === "Escape") {
			if (this.tempTool) {
				event.preventDefault();
				this.endTempTool();
				return;
			}
			if (controller.drawing) {
				event.preventDefault();
				controller.setDrawing(false);
			}
			return;
		}

		// Hold-to-erase is checked before the plain bindings: one key must never
		// mean both "hold" and "switch tool", that would fire on every press.
		if (this.isTempEraserKey(event)) {
			event.preventDefault();
			event.stopPropagation();
			if (!event.repeat) {
				this.beginTempTool("eraser", "key", specFromEvent(event));
			}
			return;
		}
		// Rebindable actions (see src/keys.ts). They work as soon as this PDF
		// view is focused — on a pen tablet the buttons are pressed before the
		// pen lands, so gating them on "drawing mode" makes them feel dead.
		if (keySpec) {
			const actionId = this.actionForSpec(keySpec);
			if (actionId) {
				const action = ACTIONS.find((entry) => entry.id === actionId);
				// A tool action can be bound as "按住": the side button erases
				// while held, and releasing it brings the old pen back. That is
				// the only way a pen button behaves like Photoshop's alt key.
				if (action?.tool && this.settings.keyHolds[actionId]) {
					event.preventDefault();
					event.stopPropagation();
					if (!event.repeat) {
						this.beginTempTool(action.tool, "key", keySpec);
					}
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				this.runAction(actionId);
				return;
			}
		}

		if (!active) return;
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
			event.preventDefault();
			event.stopPropagation();
			if (event.shiftKey) controller.redo();
			else controller.undo();
			return;
		}
		if (event.ctrlKey || event.metaKey || event.altKey) return;
	}

	private handleKeyUp(event: KeyboardEvent): void {
		this.syncAlt(event.altKey);
		if (this.settings.logKeyEvents) {
			this.log(`key up ${specFromEvent(event) || event.key}`);
		}
		if (this.keyReleasedTempTool(event)) this.endTempTool("key");
		// Letting go of Shift ends the brush HUD immediately, even if the pen
		// stops moving at the same time.
		if (!event.shiftKey) this.endShiftAdjust();
	}

	private async handleRename(oldPath: string, newPath: string): Promise<void> {
		await this.storage.move(oldPath, newPath);
		for (const controller of this.controllers.values()) {
			controller.onVaultRename(oldPath, newPath);
		}
	}
}
