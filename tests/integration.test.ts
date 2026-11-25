import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

declare const require: NodeRequire;
declare const __dirname: string;

/* -------------------------------------------------------------------------- */
/* Browser environment                                                        */
/* -------------------------------------------------------------------------- */

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
	pretendToBeVisual: true,
	url: "app://obsidian.md/",
});
const { window } = dom;

(globalThis as any).window = window;


(globalThis as any).document = window.document;
(globalThis as any).HTMLElement = window.HTMLElement;
(globalThis as any).Element = window.Element;
(globalThis as any).Node = window.Node;
(globalThis as any).Event = window.Event;
(globalThis as any).MouseEvent = window.MouseEvent;
(globalThis as any).KeyboardEvent = window.KeyboardEvent;
(globalThis as any).requestAnimationFrame = window.requestAnimationFrame.bind(window);
(globalThis as any).cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
(globalThis as any).MutationObserver = window.MutationObserver;
(globalThis as any).devicePixelRatio = 1;

// Obsidian adds these helpers to HTMLElement at runtime; jsdom does not have
// them, so the harness provides the same behaviour (the plugin uses
// setCssStyles instead of assigning `element.style.x`).
(window as any).HTMLElement.prototype.setCssStyles = function (styles: Record<string, string>) {
	Object.assign(this.style, styles);
};
(window as any).HTMLElement.prototype.setCssProps = function (props: Record<string, string>) {
	for (const [key, value] of Object.entries(props)) this.style.setProperty(key, value);
};

const fakeCtx = () => {
	const calls: string[] = [];
	const ctx: any = {
		globalAlpha: 1,
		globalCompositeOperation: "source-over",
		strokeStyle: "",
		fillStyle: "",
		lineWidth: 0,
		lineCap: "",
		lineJoin: "",
		save() {
			calls.push("save");
		},
		restore() {
			calls.push("restore");
		},
		beginPath() {},
		moveTo() {},
		lineTo() {},
		quadraticCurveTo() {},
		arc() {},
		rect() {},
		ellipse() {},
		clip() {},
		closePath() {},
		fill() {},
		stroke() {
			calls.push("stroke");
		},
		clearRect() {},
		setTransform() {},
		translate() {},
		rotate() {},
		drawImage() {},
		strokeRect() {},
		fillRect() {},
		setLineDash() {},
	};
	return ctx;
};

window.HTMLCanvasElement.prototype.getContext = function getContext() {
	return fakeCtx();
};

(window as any).Element.prototype.getBoundingClientRect = function () {
	return {
		left: 0,
		top: 0,
		right: 800,
		bottom: 1000,
		width: 800,
		height: 1000,
		x: 0,
		y: 0,
		toJSON() {},
	};
};

Object.defineProperty(window.HTMLElement.prototype, "clientWidth", {
	configurable: true,
	get() {
		return 800;
	},
});
Object.defineProperty(window.HTMLElement.prototype, "clientHeight", {
	configurable: true,
	get() {
		return 1000;
	},
});

class FakeIntersectionObserver {
	constructor(private readonly callback: IntersectionObserverCallback) {}
	observe(target: Element) {
		this.callback(
			[{ target, isIntersecting: true, intersectionRatio: 1 } as any],
			this as any,
		);
	}
	unobserve() {}
	disconnect() {}
	takeRecords() {
		return [];
	}
}
(globalThis as any).IntersectionObserver = FakeIntersectionObserver;
(window as any).IntersectionObserver = FakeIntersectionObserver;

/* -------------------------------------------------------------------------- */
/* Obsidian API mock                                                          */
/* -------------------------------------------------------------------------- */

const notices: string[] = [];

class Events {
	private readonly handlers = new Map<string, Set<(...args: any[]) => void>>();
	on(name: string, callback: (...args: any[]) => void) {
		if (!this.handlers.has(name)) this.handlers.set(name, new Set());
		this.handlers.get(name)!.add(callback);
		return { name };
	}
	off(name: string, callback: (...args: any[]) => void) {
		this.handlers.get(name)?.delete(callback);
	}
	trigger(name: string, ...args: any[]) {
		for (const callback of this.handlers.get(name) ?? []) callback(...args);
	}
}

class Plugin {
	app: any;
	manifest: any;
	constructor(app?: any, manifest?: any) {
		this.app = app;
		this.manifest = manifest;
	}
	addRibbonIcon() {
		return window.document.createElement("div");
	}
	addCommand(command: any) {
		return command;
	}
	addSettingTab() {}
	registerView() {}
	register(_callback: () => void) {}
	registerEvent(ref: any) {
		return ref;
	}
	registerDomEvent(
		el: EventTarget,
		type: string,
		callback: EventListener,
		options?: boolean | AddEventListenerOptions,
	) {
		el.addEventListener(type, callback, options);
	}
	async loadData() {
		return null;
	}
	async saveData() {}
}

class ItemView {
	app: any;
	leaf: any;
	contentEl: HTMLElement;
	constructor(leaf: any) {
		this.leaf = leaf;
		this.app = leaf?.app;
		this.contentEl = window.document.createElement("div");
	}
	registerEvent() {}
	registerDomEvent() {}
}

class PluginSettingTab {
	app: any;
	plugin: any;
	containerEl: HTMLElement;
	constructor(app: any, plugin: any) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = window.document.createElement("div");
	}
}

class Setting {
	setName() {
		return this;
	}
	setDesc() {
		return this;
	}
	addText() {
		return this;
	}
	addColorPicker() {
		return this;
	}
	addSlider() {
		return this;
	}
	addToggle() {
		return this;
	}
	addButton() {
		return this;
	}
}

class Modal {
	contentEl = window.document.createElement("div");
	titleEl = window.document.createElement("div");
	constructor(_app: any) {}
	open() {}
	close() {}
}

class Notice {
	constructor(message: string) {
		notices.push(String(message));
	}
}

function setIcon(el: HTMLElement, icon: string) {
	el.setAttribute("data-icon", icon);
}

function setTooltip(el: HTMLElement, text: string) {
	el.setAttribute("title", text);
}

const obsidianMock = {
	Plugin,
	Events,
	ItemView,
	PluginSettingTab,
	Setting,
	Modal,
	Notice,
	setIcon,
	setTooltip,
	// i18n resolves "auto" against the host language; the fixtures expect Chinese.
	getLanguage: () => "zh",
};

const NodeModule = require("node:module");
const originalLoad = NodeModule._load;
NodeModule._load = function (request: string, ...rest: any[]) {
	if (request === "obsidian") return obsidianMock;
	return originalLoad.call(this, request, ...rest);
};

/* -------------------------------------------------------------------------- */
/* Vault fixtures                                                             */
/* -------------------------------------------------------------------------- */

class FakeAdapter {
	files = new Map<string, string>();
	folders = new Set<string>();
	async exists(p: string) {
		return this.files.has(p) || this.folders.has(p);
	}
	async read(p: string) {
		const value = this.files.get(p);
		if (value === undefined) throw new Error(`ENOENT ${p}`);
		return value;
	}
	async write(p: string, data: string) {
		this.files.set(p, data);
	}
	async mkdir(p: string) {
		this.folders.add(p);
	}
	async rename(from: string, to: string) {
		const value = this.files.get(from);
		if (value === undefined) throw new Error(`ENOENT ${from}`);
		this.files.delete(from);
		this.files.set(to, value);
	}
}

class FakeBus {
	private readonly handlers = new Map<string, Set<(...args: any[]) => void>>();
	on(name: string, callback: (...args: any[]) => void) {
		if (!this.handlers.has(name)) this.handlers.set(name, new Set());
		this.handlers.get(name)!.add(callback);
	}
	off(name: string, callback: (...args: any[]) => void) {
		this.handlers.get(name)?.delete(callback);
	}
	fire(name: string, event?: any) {
		for (const callback of this.handlers.get(name) ?? []) callback(event);
	}
}

class FakeWorkspace {
	activeLeaf: any = null;
	leaves: any[] = [];
	/** Every leaf handed to setActiveLeaf, in order. */
	activated: any[] = [];
	iterateAllLeaves(callback: (leaf: any) => void) {
		for (const leaf of this.leaves) callback(leaf);
	}
	/**
	 * Mirrors the real workspace closely enough for the split-layout tests: the
	 * leaf becomes active *and* carries the `.mod-active` class, because the
	 * plugin resolves the active view from that class.
	 */
	setActiveLeaf(leaf: any) {
		for (const el of Array.from(window.document.querySelectorAll(".workspace-leaf.mod-active"))) {
			el.classList.remove("mod-active");
		}
		(leaf.containerEl as HTMLElement | undefined)?.classList.add("mod-active");
		this.activeLeaf = leaf;
		this.activated.push(leaf);
	}
	on() {
		return {};
	}
	getLeavesOfType(type: string) {
		return this.leaves.filter((leaf) => leaf.view?.getViewType?.() === type);
	}
	getRightLeaf() {
		return null;
	}
	revealLeaf() {}
	onLayoutReady(callback: () => void) {
		callback();
	}
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function findBuiltPlugin(): string {
	let dir = __dirname;
	for (let i = 0; i < 4; i++) {
		const candidate = path.join(dir, "main.js");
		if (fs.existsSync(candidate)) return candidate;
		dir = path.dirname(dir);
	}
	throw new Error("main.js 未构建，请先执行构建命令");
}

async function waitFor(predicate: () => boolean, timeout = 3000) {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > timeout) throw new Error("timeout");
		await wait(10);
	}
}

function pointer(
	type: string,
	x: number,
	y: number,
	options: {
		pointerType?: string;
		pressure?: number;
		altKey?: boolean;
		shiftKey?: boolean;
		button?: number;
		buttons?: number;
	} = {},
): PointerEvent {
	const event = new window.MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		clientX: x,
		clientY: y,
		button: options.button ?? 0,
		buttons:
			options.buttons ??
			(type === "pointerup" || type === "pointercancel" ? 0 : 1),
		altKey: !!options.altKey,
		shiftKey: !!options.shiftKey,
	});
	Object.defineProperties(event, {
		pointerId: { value: 1 },
		pointerType: { value: options.pointerType ?? "mouse" },
		pressure: { value: options.pressure ?? 0.5 },
		isPrimary: { value: true },
	});
	return event as unknown as PointerEvent;
}

/* -------------------------------------------------------------------------- */
/* Test                                                                       */
/* -------------------------------------------------------------------------- */

test("1.0 end-to-end: draw, shape, erase, layers, undo, stylus", async () => {
	const adapter = new FakeAdapter();
	const workspace = new FakeWorkspace();
	const app = { workspace, vault: { adapter, on: () => ({}) } };

	const containerEl = window.document.createElement("div");
	containerEl.className = "view-content";
	window.document.body.appendChild(containerEl);
	const pdfContainer = window.document.createElement("div");
	pdfContainer.className = "pdf-container";
	containerEl.appendChild(pdfContainer);
	const scrollEl = window.document.createElement("div");
	scrollEl.className = "pdf-viewer-container";
	pdfContainer.appendChild(scrollEl);
	const viewerEl = window.document.createElement("div");
	viewerEl.className = "pdfViewer";
	scrollEl.appendChild(viewerEl);
	const pageEl = window.document.createElement("div");
	pageEl.className = "page";
	pageEl.dataset.pageNumber = "1";
	const wrapper = window.document.createElement("div");
	wrapper.className = "canvasWrapper";
	wrapper.appendChild(window.document.createElement("canvas"));
	pageEl.appendChild(wrapper);
	viewerEl.appendChild(pageEl);

	// Deliberately no `pdfViewer` / `viewer` property: Obsidian 1.12 exposes the
	// PDF viewer through `view.viewer`, so the plugin must work from the DOM.
	const file = { path: "资料/测试.pdf", extension: "pdf", basename: "测试" };
	const view = {
		getViewType: () => "pdf",
		containerEl,
		file,
	};
	const leaf: any = { view };
	workspace.leaves.push(leaf);
	workspace.activeLeaf = leaf;

	const { default: PdfInkPlugin } = require(findBuiltPlugin());
	const plugin: any = new (PdfInkPlugin as any)();
	plugin.app = app;
	await plugin.onload();

	const controller = plugin.getActiveController();
	assert.ok(controller, "controller should attach to the PDF leaf");
	await waitFor(() => !!controller.doc);

	assert.equal(controller.doc.layers.length, 1);
	assert.ok(containerEl.querySelector(".pdf-ink-toolbar"), "toolbar is shown");

	const layer = controller.doc.layers[0];
	const live = pageEl.querySelector(".pdf-ink-canvas-live");
	assert.ok(live, "live canvas mounted");

	/* --- mouse freehand -------------------------------------------------- */

	controller.setDrawing(true);
	live!.dispatchEvent(pointer("pointerdown", 100, 200));
	live!.dispatchEvent(pointer("pointermove", 300, 400));
	live!.dispatchEvent(pointer("pointermove", 500, 600));
	live!.dispatchEvent(pointer("pointerup", 500, 600));
	await wait(20);

	assert.equal(layer.strokes.length, 1);
	const pen = layer.strokes[0];
	assert.equal(pen.kind, "pen");
	assert.equal(pen.page, 1);
	assert.ok(Math.abs(pen.points[0] - 0.125) < 1e-6);
	assert.ok(Math.abs(pen.points[1] - 0.2) < 1e-6);
	assert.ok(pen.points.length >= 9);

	/* --- a tap in pen mode draws a dot; it never selects ink -------------- */

	const beforeTap = layer.strokes.length;
	live!.dispatchEvent(pointer("pointerdown", 300, 400));
	live!.dispatchEvent(pointer("pointerup", 300, 400));
	await wait(20);
	assert.equal(
		layer.strokes.length,
		beforeTap + 1,
		"a pen tap commits a dot instead of swallowing the stroke",
	);
	assert.equal(controller.hasSelection, false, "a pen tap does not select ink");
	assert.equal(layer.strokes[beforeTap].points.length, 3, "the dot is one point");
	controller.undo();
	await wait(10);
	assert.equal(layer.strokes.length, beforeTap, "the dot is undoable");

	/* --- shape ----------------------------------------------------------- */

	plugin.setTool("rect");
	live!.dispatchEvent(pointer("pointerdown", 100, 100));
	live!.dispatchEvent(pointer("pointermove", 300, 300));
	live!.dispatchEvent(pointer("pointerup", 300, 300));
	await wait(20);

	assert.equal(layer.strokes.length, 2);
	const rect = layer.strokes[1];
	assert.equal(rect.kind, "rect");
	assert.deepEqual(rect.points.slice(0, 2), [0.125, 0.1]);
	assert.ok(Math.abs(rect.points[3] - 0.375) < 1e-6);

	/* --- partial erase cuts the ink instead of storing a mask ------------- */

	const beforeErase = layer.strokes.length;
	plugin.setTool("eraser");
	// Crosses the pen stroke at (300, 400) so it gets cut into pieces.
	live!.dispatchEvent(pointer("pointerdown", 300, 300));
	live!.dispatchEvent(pointer("pointermove", 300, 500));
	live!.dispatchEvent(pointer("pointerup", 300, 500));
	await wait(20);

	assert.equal(
		layer.strokes.some((entry: { kind: string }) => entry.kind.startsWith("eraser")),
		false,
		"no eraser mask is stored any more",
	);
	const afterErase = layer.strokes.length;
	assert.notEqual(afterErase, beforeErase, "the stroke was cut or removed");

	controller.undo();
	await wait(10);
	assert.equal(layer.strokes.length, beforeErase);
	controller.redo();
	await wait(10);
	assert.equal(layer.strokes.length, afterErase);

	/* --- undo / redo of drawing ------------------------------------------ */

	controller.undo();
	controller.undo();
	await wait(10);
	assert.ok(layer.strokes.length < afterErase);
	const afterTwoUndos = layer.strokes.length;
	controller.redo();
	await wait(10);
	assert.ok(layer.strokes.length >= afterTwoUndos);

	/* --- pdf.js page reset removes every child of .page ------------------- */

	const beforeReset = layer.strokes.length;
	for (const canvas of Array.from(pageEl.querySelectorAll("canvas"))) {
		if (canvas.classList.contains("pdf-ink-canvas")) canvas.remove();
	}
	await wait(60);
	assert.ok(pageEl.querySelector(".pdf-ink-canvas-live"), "live canvas reattached");
	assert.ok(
		pageEl.querySelector(".pdf-ink-canvas-committed"),
		"committed canvas reattached",
	);

	plugin.setTool("pen");
	controller.setDrawing(true);
	live!.dispatchEvent(pointer("pointerdown", 100, 100));
	live!.dispatchEvent(pointer("pointermove", 150, 150));
	live!.dispatchEvent(pointer("pointerup", 150, 150));
	await wait(20);
	assert.equal(layer.strokes.length, beforeReset + 1);
	controller.undo();
	await wait(10);
	assert.equal(layer.strokes.length, beforeReset);

	/* --- stylus draws without draw mode ---------------------------------- */

	plugin.setTool("pen");
	controller.setDrawing(false);
	const before = layer.strokes.length;
	pageEl.dispatchEvent(
		pointer("pointerdown", 200, 300, { pointerType: "pen", pressure: 0.8 }),
	);
	window.dispatchEvent(pointer("pointermove", 250, 350, { pointerType: "pen", pressure: 0.8 }));
	window.dispatchEvent(pointer("pointerup", 250, 350, { pointerType: "pen", pressure: 0.8 }));
	await wait(20);

	assert.equal(layer.strokes.length, before + 1);
	const stylus = layer.strokes[layer.strokes.length - 1];
	assert.equal(stylus.kind, "pen");
	assert.ok(Math.abs(stylus.points[2] - 0.8) < 1e-6);

	/* --- Alt passthrough -------------------------------------------------- */

	const beforeAlt = layer.strokes.length;
	pageEl.dispatchEvent(
		pointer("pointerdown", 300, 300, { pointerType: "pen", altKey: true }),
	);
	window.dispatchEvent(pointer("pointerup", 300, 300, { pointerType: "pen", altKey: true }));
	await wait(10);
	assert.equal(layer.strokes.length, beforeAlt);

	/* --- layers ----------------------------------------------------------- */

	const newLayer = controller.addLayer();
	assert.equal(controller.doc.layers.length, 2);
	assert.equal(controller.doc.activeLayerId, newLayer.id);
	controller.setLayerVisible(newLayer.id, false);
	assert.equal(controller.doc.layers[1].visible, false);
	controller.setLayerVisible(newLayer.id, true);
	controller.deleteLayer(newLayer.id);
	assert.equal(controller.doc.layers.length, 1);
	controller.undo();
	await wait(10);
	assert.equal(controller.doc.layers.length, 2);

	/* --- clipboard -------------------------------------------------------- */

	controller.setDrawing(true);
	plugin.setTool("select");
	const inkLayer = controller.doc.layers[0];
	assert.equal(controller.selectAll(), true);
	assert.ok(controller.hasSelection, "everything on the page is selected");
	const totalInk = () =>
		controller.doc.layers.reduce(
			(sum: number, layer: { strokes: unknown[] }) => sum + layer.strokes.length,
			0,
		);
	const beforeCopy = totalInk();
	assert.equal(controller.copySelection(), true);
	assert.equal(controller.pasteClipboard(), true);
	assert.equal(totalInk(), beforeCopy * 2, "pasted copies were added");
	controller.undo();
	await wait(10);
	assert.equal(totalInk(), beforeCopy, "paste is undoable");

	/* --- brush panel: double click a brush, click a preset ----------------- */

	plugin.setTool("pen");
	const toolbarEl = containerEl.querySelector<HTMLElement>(".pdf-ink-toolbar");
	const penButton = toolbarEl!.querySelector<HTMLElement>('[data-tool="pen"]')!;
	assert.ok(penButton, "pen button exists");
	penButton.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
	const panel = window.document.querySelector<HTMLElement>(".pdf-ink-brush-panel");
	assert.ok(panel, "double click opens the brush panel");

	const bluePreset = Array.from(panel!.querySelectorAll<HTMLElement>(".pdf-ink-preset")).find(
		(chip) => (chip.textContent ?? "").includes("蓝 · 5"),
	);
	assert.ok(bluePreset, "the seeded 蓝 · 5 preset is rendered");
	bluePreset!.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
	assert.equal(plugin.settings.penColor, "#1971c2", "preset applies the color");
	assert.equal(plugin.settings.penWidth, 5, "preset applies the width");

	// Mouse users expect the right button to open the edit menu, not a long press.
	bluePreset!.dispatchEvent(
		new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
	);
	assert.ok(
		window.document.querySelector(".pdf-ink-preset-menu"),
		"right click opens the preset menu",
	);
	window.document.dispatchEvent(
		new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
	);
	await wait(5);

	// Touching the page dismisses the panel. The pen path swallows the event at
	// the window, so the panel cannot rely on its own "click outside" listener.
	penButton.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
	assert.ok(
		window.document.querySelector(".pdf-ink-brush-panel"),
		"the panel reopens",
	);
	controller.setDrawing(true);
	// The panel registers its outside-click listener on a 0 ms timer.
	await wait(10);
	live.dispatchEvent(pointer("pointerdown", 300, 300, { pointerType: "pen" }));
	assert.equal(
		window.document.querySelector(".pdf-ink-brush-panel"),
		null,
		"a pen touch on the page closes the panel",
	);
	live.dispatchEvent(pointer("pointerup", 300, 300, { pointerType: "pen" }));
	await wait(10);

	// Editing one brush must not leak into the other one.
	plugin.setBrushColor("highlighter", "#2f9e44");
	assert.equal(plugin.settings.highlighterColor, "#2f9e44");
	assert.equal(plugin.settings.penColor, "#1971c2");

	// The quick-colour row only belongs to the ink tools.
	const quickRow = toolbarEl!.querySelector<HTMLElement>(".pdf-ink-quick-colors")!;
	plugin.setTool("pen");
	assert.equal(quickRow.classList.contains("is-hidden"), false);
	plugin.setTool("eraser");
	assert.equal(quickRow.classList.contains("is-hidden"), true);
	plugin.setTool("select");
	assert.equal(quickRow.classList.contains("is-hidden"), true, "hidden for the select tool");
	plugin.setTool("pen");
	assert.equal(quickRow.classList.contains("is-hidden"), false);

	// The colour read-out is inert: no popover, no toggling.
	const chip = toolbarEl!.querySelector<HTMLElement>(".pdf-ink-color-chip");
	assert.ok(chip, "the current colour is shown as a chip");
	chip!.dispatchEvent(pointer("pointerdown", 100, 100));
	chip!.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
	assert.equal(
		window.document.querySelector(".pdf-ink-palette"),
		null,
		"the old palette popover is gone",
	);

	// The eraser opens its own panel: two axes as segmented buttons.
	const eraserButton = toolbarEl!.querySelector<HTMLElement>('[data-tool="eraser"]')!;
	eraserButton.dispatchEvent(
		new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }),
	);
	const eraserPanel = window.document.querySelector<HTMLElement>(".pdf-ink-brush-panel");
	assert.ok(eraserPanel, "the eraser button opens the brush panel");
	const segments = Array.from(
		eraserPanel!.querySelectorAll<HTMLElement>(".pdf-ink-panel-seg"),
	);
	assert.equal(segments.length, 5, "2 erase modes + 3 erase regions");
	const rectSegment = segments.find((el) => el.textContent === "矩形");
	assert.ok(rectSegment, "region segment exists");
	rectSegment!.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
	assert.equal(plugin.settings.eraserRegion, "rect");

	// A single click must apply the tool and nothing else: the panel must not
	// pop open 420ms later (the long-press timer used to survive a click).
	controller.toolbar.closePopovers();
	plugin.setTool("pen");
	penButton.dispatchEvent(pointer("pointerdown", 100, 100));
	penButton.dispatchEvent(pointer("pointerup", 100, 100));
	await wait(520);
	assert.equal(
		window.document.querySelector(".pdf-ink-brush-panel"),
		null,
		"a single click never opens the brush panel",
	);

	// Starting a stroke closes the panel (no popover in the way of the pen).
	plugin.setTool("pen");
	controller.setDrawing(true);
	live!.dispatchEvent(pointer("pointerdown", 500, 500));
	live!.dispatchEvent(pointer("pointermove", 520, 520));
	live!.dispatchEvent(pointer("pointerup", 520, 520));
	await wait(10);
	assert.equal(
		window.document.querySelector(".pdf-ink-brush-panel"),
		null,
		"panel closes when a stroke starts",
	);
	controller.undo();
	await wait(10);

	/* --- keyboard nudge of the selection ---------------------------------- */

	plugin.setTool("select");
	assert.equal(controller.selectAll(), true);
	const nudgeTarget = controller.doc.layers
		.flatMap((entry: { strokes: Array<{ page: number; points: number[] }> }) => entry.strokes)
		.find(
			(entry: { page: number; points: number[] }) =>
				entry.page === 1 && entry.points[0] > 0.15 && entry.points[0] < 0.35,
		);
	assert.ok(nudgeTarget, "found a stroke to nudge");
	const beforeNudge = nudgeTarget!.points.slice(0, 2);
	assert.equal(controller.nudgeSelection(10, 0), true);
	assert.ok(
		nudgeTarget!.points[0] - beforeNudge[0] > 0.01,
		"10px nudge moves the ink right",
	);
	controller.undo();
	await wait(10);
	assert.ok(Math.abs(nudgeTarget!.points[0] - beforeNudge[0]) < 1e-9, "nudge is undoable");

	/* --- scale / rotate from the selection handles ------------------------ */

	const pageStrokes = () =>
		controller.doc.layers.flatMap((entry: { strokes: any[] }) => entry.strokes) as Array<{
			page: number;
			points: number[];
			rings?: number[][];
			kind: string;
		}>;
	const pageBounds = () => {
		let x0 = Infinity;
		let y0 = Infinity;
		let x1 = -Infinity;
		let y1 = -Infinity;
		for (const stroke of pageStrokes()) {
			if (stroke.page !== 1) continue;
			for (let i = 0; i + 1 < stroke.points.length; i += 3) {
				x0 = Math.min(x0, stroke.points[i]);
				x1 = Math.max(x1, stroke.points[i]);
				y0 = Math.min(y0, stroke.points[i + 1]);
				y1 = Math.max(y1, stroke.points[i + 1]);
			}
			for (const ring of stroke.rings ?? []) {
				for (let i = 0; i + 1 < ring.length; i += 2) {
					x0 = Math.min(x0, ring[i]);
					x1 = Math.max(x1, ring[i]);
					y0 = Math.min(y0, ring[i + 1]);
					y1 = Math.max(y1, ring[i + 1]);
				}
			}
		}
		return { x0, y0, x1, y1 };
	};

	plugin.setTool("select");
	assert.equal(controller.selectAll(), true);
	const boxBefore = pageBounds();
	const beforeArea = (boxBefore.x1 - boxBefore.x0) * (boxBefore.y1 - boxBefore.y0);
	// The bottom-right handle sits on the padded frame (10px outside the ink).
	const handleX = Math.round(boxBefore.x1 * 800) + 10;
	const handleY = Math.round(boxBefore.y1 * 1000) + 10;
	live!.dispatchEvent(pointer("pointerdown", handleX, handleY));
	live!.dispatchEvent(pointer("pointermove", handleX + 60, handleY + 75));
	live!.dispatchEvent(pointer("pointerup", handleX + 60, handleY + 75));
	await wait(10);

	assert.equal(controller.history.undoLabel, "缩放笔迹");
	const boxAfter = pageBounds();
	const afterArea = (boxAfter.x1 - boxAfter.x0) * (boxAfter.y1 - boxAfter.y0);
	assert.ok(afterArea > beforeArea * 1.2, "dragging a corner scales the ink up");
	controller.undo();
	await wait(10);
	assert.ok(
		Math.abs(pageBounds().x1 - boxBefore.x1) < 1e-6,
		"scale is a single undoable step",
	);

	// Free scaling: a purely horizontal drag must widen without changing height.
	const boxTall = pageBounds();
	const freeX = Math.round(boxTall.x1 * 800) + 10;
	const freeY = Math.round(boxTall.y1 * 1000) + 10;
	assert.equal(controller.selectAll(), true);
	live!.dispatchEvent(pointer("pointerdown", freeX, freeY));
	live!.dispatchEvent(pointer("pointermove", freeX + 120, freeY));
	live!.dispatchEvent(pointer("pointerup", freeX + 120, freeY));
	await wait(10);
	const boxWide = pageBounds();
	assert.ok(
		boxWide.x1 - boxWide.x0 > (boxTall.x1 - boxTall.x0) * 1.15,
		"horizontal drag widens the ink",
	);
	assert.ok(
		Math.abs(boxWide.y1 - boxWide.y0 - (boxTall.y1 - boxTall.y0)) < 1e-6,
		"height is untouched by a horizontal drag",
	);
	controller.undo();
	await wait(10);

	// Edge midpoint: stretches one axis and ignores motion along the other.
	const boxEdge = pageBounds();
	const eastX = Math.round(boxEdge.x1 * 800) + 10;
	const eastY = Math.round(((boxEdge.y0 + boxEdge.y1) / 2) * 1000);
	assert.equal(controller.selectAll(), true);
	// Grab 5px off the midpoint: the locked axis must still stay at 100%,
	// otherwise a small vertical drag would scale the height by (5+40)/5.
	live!.dispatchEvent(pointer("pointerdown", eastX, eastY + 5));
	live!.dispatchEvent(pointer("pointermove", eastX + 60, eastY + 45));
	live!.dispatchEvent(pointer("pointerup", eastX + 60, eastY + 45));
	await wait(10);
	const boxEdgeAfter = pageBounds();
	assert.ok(
		boxEdgeAfter.x1 - boxEdgeAfter.x0 > (boxEdge.x1 - boxEdge.x0) * 1.1,
		"dragging the east edge widens the ink",
	);
	assert.ok(
		Math.abs(boxEdgeAfter.y1 - boxEdgeAfter.y0 - (boxEdge.y1 - boxEdge.y0)) < 1e-6,
		"the east edge leaves the height alone",
	);
	controller.undo();
	await wait(10);

	// Rotate: grab the knob above the frame and swing 90°.
	const rotatedBox = pageBounds();
	const knobX = Math.round(((rotatedBox.x0 + rotatedBox.x1) / 2) * 800);
	const knobY = Math.max(8, Math.round(rotatedBox.y0 * 1000) - 22);
	const sample = pageStrokes().find((stroke) => stroke.page === 1)!;
	const beforeRotate = sample.points.slice();
	assert.equal(controller.selectAll(), true);
	live!.dispatchEvent(pointer("pointerdown", knobX, knobY));
	live!.dispatchEvent(pointer("pointermove", knobX + 120, knobY + 120));
	live!.dispatchEvent(pointer("pointerup", knobX + 120, knobY + 120));
	await wait(10);
	assert.equal(controller.history.undoLabel, "旋转笔迹");
	assert.notDeepEqual(sample.points, beforeRotate, "rotation rewrote the geometry");
	assert.ok(
		Math.abs(controller.selectionAngle) > 0.05,
		"the frame keeps the rotation instead of snapping back to axis aligned",
	);
	controller.undo();
	await wait(10);
	assert.ok(
		Math.abs(controller.selectionAngle) < 1e-9,
		"undo restores the frame orientation too",
	);
	assert.deepEqual(sample.points, beforeRotate, "rotation is undoable");

	/* --- the selection frame follows the ink when it is dragged ----------- */

	plugin.setTool("select");
	assert.equal(controller.selectAll(), true);
	const frameBefore = controller.selectionFrame;
	assert.ok(frameBefore, "a selection has a frame");
	const dragX = Math.round(((frameBefore!.x0 + frameBefore!.x1) / 2) * 800);
	const dragY = Math.round(((frameBefore!.y0 + frameBefore!.y1) / 2) * 1000);
	// Grab the middle of the ink: that starts a move, not a rubber band.
	live!.dispatchEvent(pointer("pointermove", dragX, dragY, { buttons: 0 }));
	live!.dispatchEvent(pointer("pointerdown", dragX, dragY));
	live!.dispatchEvent(pointer("pointermove", dragX + 40, dragY + 20));
	live!.dispatchEvent(pointer("pointerup", dragX + 40, dragY + 20));
	await wait(10);
	assert.equal(controller.history.undoLabel, "移动笔迹");
	const frameAfter = controller.selectionFrame;
	assert.ok(frameAfter, "still selected after the move");
	assert.ok(
		frameAfter!.x0 - frameBefore!.x0 > 0.03,
		"the frame moved right with the ink",
	);
	assert.ok(
		Math.abs(frameAfter!.x1 - frameAfter!.x0 - (frameBefore!.x1 - frameBefore!.x0)) < 1e-6,
		"the frame kept its width",
	);
	controller.undo();
	await wait(10);

	/* --- eraser disc only for the freehand eraser ------------------------- */

	plugin.setTool("eraser");
	plugin.setEraserRegion("free");
	pageEl.dispatchEvent(pointer("pointermove", 200, 300, { buttons: 0 }));
	const disc = containerEl.querySelector<HTMLElement>(".pdf-ink-eraser-cursor");
	assert.ok(disc, "the freehand eraser previews its radius");
	assert.equal(disc!.style.display, "block");
	plugin.setEraserRegion("rect");
	assert.notEqual(disc!.style.display, "block", "rect erase hides the disc");
	pageEl.dispatchEvent(pointer("pointermove", 210, 310, { buttons: 0 }));
	assert.notEqual(disc!.style.display, "block", "the disc stays hidden while hovering");
	plugin.setEraserRegion("free");
	plugin.setTool("pen");

	/* --- compatibility mouse events are shielded while writing ------------ */

	let compatSeen = 0;
	const compatListener = (): void => {
		compatSeen++;
	};
	window.document.addEventListener("mouseup", compatListener);
	plugin.setTool("pen");
	controller.setDrawing(true);
	live!.dispatchEvent(pointer("pointerdown", 200, 200));
	pageEl.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true }));
	live!.dispatchEvent(pointer("pointerup", 200, 200));
	assert.equal(compatSeen, 0, "other plugins never see the stroke's mouseup");
	await wait(420);
	pageEl.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true }));
	assert.equal(compatSeen, 1, "the shield releases after the stroke");
	window.document.removeEventListener("mouseup", compatListener);

	/* --- palette colour editor (in-panel, no native dialog) --------------- */

	penButton.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
	const panelForColour = window.document.querySelector<HTMLElement>(".pdf-ink-brush-panel");
	assert.ok(panelForColour, "the brush panel reopens");
	const swatch = panelForColour!.querySelector<HTMLElement>(".pdf-ink-panel-swatch");
	assert.ok(swatch, "a palette swatch is there");
	swatch!.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
	const editor = window.document.querySelector<HTMLElement>(".pdf-ink-color-editor");
	assert.ok(editor, "double click opens the colour editor");
	const sliders = editor!.querySelectorAll<HTMLInputElement>('input[type="range"]');
	assert.equal(sliders.length, 3, "hue / saturation / lightness");
	const beforeColour = plugin.settings.palette[0];
	sliders[0].value = "120";
	sliders[0].dispatchEvent(new window.Event("input", { bubbles: true }));
	assert.notEqual(plugin.settings.palette[0], beforeColour, "the slot follows the slider");
	assert.equal(editor!.style.left.endsWith("px"), true, "the editor is positioned");

	/* --- cursor policy: point for thin brushes, ring for thick ones ------- */

	plugin.setTool("pen");
	plugin.setBrushWidth("pen", 2.5);
	pageEl.dispatchEvent(pointer("pointermove", 300, 400, { buttons: 0 }));
	assert.equal(
		containerEl.classList.contains("pdf-ink-cursor-point"),
		true,
		"a thin pen gets the dot cursor",
	);
	plugin.setBrushWidth("pen", 20);
	pageEl.dispatchEvent(pointer("pointermove", 300, 400, { buttons: 0 }));
	assert.equal(
		containerEl.classList.contains("pdf-ink-cursor-ring"),
		true,
		"a thick pen gets the ring",
	);
	const ring = containerEl.querySelector<HTMLElement>(".pdf-ink-brush-ring");
	assert.ok(ring, "the ring element exists");
	assert.equal(ring!.style.display, "block");
	plugin.setBrushWidth("pen", 2.5);
	pageEl.dispatchEvent(pointer("pointermove", 300, 400, { buttons: 0 }));
	assert.notEqual(ring!.style.display, "block", "the ring hides again for thin ink");

	/* --- hand tool pans the viewer, never draws --------------------------- */

	plugin.setTool("hand");
	controller.setDrawing(true);
	const scroller = pdfContainer.querySelector<HTMLElement>(".pdf-viewer-container")!;
	scroller.scrollLeft = 100;
	scroller.scrollTop = 50;
	const strokesBeforePan = layer.strokes.length;
	live!.dispatchEvent(pointer("pointerdown", 400, 400));
	window.dispatchEvent(pointer("pointermove", 340, 370));
	window.dispatchEvent(pointer("pointerup", 340, 370));
	await wait(10);
	assert.equal(scroller.scrollLeft, 160, "dragging left scrolls the page right");
	assert.equal(scroller.scrollTop, 80, "dragging up scrolls the page down");
	assert.equal(layer.strokes.length, strokesBeforePan, "the hand tool never draws");

	/* --- text selection is opt-in: select tool + Alt only ---------------- */

	plugin.setTool("pen");
	controller.setAltPassthrough(true);
	assert.equal(
		containerEl.classList.contains("pdf-ink-alt"),
		false,
		"Alt does nothing while the pen is active",
	);
	plugin.setTool("select");
	assert.equal(
		containerEl.classList.contains("pdf-ink-alt"),
		true,
		"Alt + select hands the page back to text selection",
	);
	controller.setAltPassthrough(false);
	assert.equal(containerEl.classList.contains("pdf-ink-alt"), false);
	plugin.setTool("pen");

	/* --- colors and persistence ------------------------------------------ */

	plugin.setTool("pen");
	plugin.setColor("#1971c2");
	assert.equal(plugin.settings.penColor, "#1971c2");
	assert.ok(plugin.settings.recentColors.includes("#1971c2"));

	await plugin.storage.flushAll();
	const storagePath = plugin.storage.pathFor("资料/测试.pdf");
	assert.ok(adapter.files.has(storagePath), "sidecar is written");
	const persisted = JSON.parse(adapter.files.get(storagePath)!);
	assert.equal(persisted.layers.length, 2);
	assert.ok(persisted.layers[0].strokes.length >= 1);

	/* --- Shift + touching the page resizes the brush --------------------- */

	plugin.setTool("pen");
	plugin.setBrushWidth("pen", 2.5);
	plugin.setBrushOpacity("pen", 1);
	// Hovering with Shift must do nothing: adjustment needs real contact.
	window.dispatchEvent(
		pointer("pointermove", 100, 100, { pointerType: "pen", shiftKey: true }),
	);
	assert.equal(
		window.document.querySelector(".pdf-ink-shift-hud"),
		null,
		"hovering with Shift does not start adjusting",
	);
	window.dispatchEvent(
		pointer("pointerdown", 100, 100, { pointerType: "pen", shiftKey: true }),
	);
	window.dispatchEvent(
		pointer("pointermove", 100, 100, { pointerType: "pen", shiftKey: true, buttons: 1 }),
	);
	assert.ok(
		window.document.querySelector(".pdf-ink-shift-hud"),
		"touching the page with Shift shows the brush HUD",
	);
	// The read-out must sit next to the tip: it lives on <body> (a fixed box
	// inside the transformed PDF container used to resolve against that
	// ancestor and float far away), and its position tracks the pointer.
	const hud = window.document.querySelector<HTMLElement>(".pdf-ink-shift-hud")!;
	assert.equal(hud.parentElement, window.document.body, "HUD is a body child");
	assert.ok(
		Math.abs(parseFloat(hud.style.left) - 100) < 120,
		`HUD stays near the pen tip (left=${hud.style.left})`,
	);
	window.dispatchEvent(
		pointer("pointermove", 260, 100, { pointerType: "pen", shiftKey: true, buttons: 1 }),
	);
	await wait(40);
	assert.ok(
		plugin.settings.penWidth > 2.5,
		`moving right with Shift enlarges the brush (now ${plugin.settings.penWidth})`,
	);
	window.dispatchEvent(
		pointer("pointerup", 260, 100, { pointerType: "pen", shiftKey: true }),
	);
	assert.equal(
		window.document.querySelector(".pdf-ink-shift-hud"),
		null,
		"lifting the pen ends the adjustment",
	);

	/* --- holding Shift never paints ------------------------------------- */

	plugin.setTool("pen");
	controller.setDrawing(true);
	const strokesBeforeShiftDrag = controller.doc.layers[0].strokes.length;
	live.dispatchEvent(pointer("pointerdown", 240, 240, { pointerType: "pen", shiftKey: true }));
	live.dispatchEvent(pointer("pointermove", 420, 300, { pointerType: "pen", shiftKey: true }));
	live.dispatchEvent(pointer("pointerup", 420, 300, { pointerType: "pen", shiftKey: true }));
	await wait(10);
	assert.equal(
		controller.doc.layers[0].strokes.length,
		strokesBeforeShiftDrag,
		"Shift + drag resizes instead of painting",
	);

	/* --- clear all ink keeps the layers -------------------------------- */

	const layersBeforeClear = controller.doc.layers.length;
	assert.ok(controller.clearAllInk() > 0, "clearAllInk removes the strokes");
	assert.equal(
		controller.doc.layers.reduce((sum: number, layer: any) => sum + layer.strokes.length, 0),
		0,
		"no stroke survives",
	);
	assert.equal(
		controller.doc.layers.length,
		layersBeforeClear,
		"layers themselves are kept",
	);

	await plugin.onunload();
});

/**
 * Pen-tablet path: no gestures, everything reachable from the keyboard.
 * The drivers map express keys / pen side buttons to keyboard keys, so the
 * rebindable table plus the hold-to-erase pair is the whole story.
 */
test("1.1 pen tablet: rebindable keys and hold-to-erase", async () => {
	const adapter = new FakeAdapter();
	const workspace = new FakeWorkspace();
	const app = { workspace, vault: { adapter, on: () => ({}) } };

	const containerEl = window.document.createElement("div");
	containerEl.className = "view-content";
	window.document.body.appendChild(containerEl);
	const pdfContainer = window.document.createElement("div");
	pdfContainer.className = "pdf-container";
	containerEl.appendChild(pdfContainer);
	const scrollEl = window.document.createElement("div");
	scrollEl.className = "pdf-viewer-container";
	pdfContainer.appendChild(scrollEl);
	const viewerEl = window.document.createElement("div");
	viewerEl.className = "pdfViewer";
	scrollEl.appendChild(viewerEl);
	const pageEl = window.document.createElement("div");
	pageEl.className = "page";
	pageEl.dataset.pageNumber = "1";
	const wrapper = window.document.createElement("div");
	wrapper.className = "canvasWrapper";
	wrapper.appendChild(window.document.createElement("canvas"));
	pageEl.appendChild(wrapper);
	viewerEl.appendChild(pageEl);

	const file = { path: "资料/数位板.pdf", extension: "pdf", basename: "数位板" };
	const view = { getViewType: () => "pdf", containerEl, file };
	const leaf: any = { view };
	workspace.leaves.push(leaf);
	workspace.activeLeaf = leaf;

	const { default: PdfInkPlugin } = require(findBuiltPlugin());
	const plugin: any = new (PdfInkPlugin as any)();
	plugin.app = app;
	// A sidecar that still carries a legacy eraser mask (dev.20 format): loading
	// it must drop the mask outright instead of migrating it.
	adapter.files.set(
		"附件/Ink 标注/资料/数位板.pdf.json",
		JSON.stringify({
			version: 1,
			file: "资料/数位板.pdf",
			activeLayerId: "l1",
			layers: [
				{
					id: "l1",
					name: "图层 1",
					visible: true,
					locked: false,
					opacity: 1,
					strokes: [
						{
							id: "s1",
							kind: "pen",
							page: 1,
							color: "#e03131",
							width: 0.002,
							opacity: 1,
							points: [0.1, 0.1, 0.5, 0.4, 0.4, 0.5],
						},
						{
							id: "s2",
							kind: "eraser",
							page: 1,
							color: "#000000",
							width: 0.01,
							opacity: 1,
							points: [0.2, 0.2, 0.5, 0.2, 0.3, 0.5],
						},
					],
				},
			],
		}),
	);
	await plugin.onload();

	const controller = plugin.getActiveController();
	assert.ok(controller, "controller attaches");
	await waitFor(() => !!controller.doc);
	assert.equal(
		controller.doc.layers[0].strokes.some((stroke: any) =>
			String(stroke.kind).startsWith("eraser"),
		),
		false,
		"legacy eraser masks are purged on load",
	);
	assert.equal(
		controller.doc.layers[0].strokes.some((stroke: any) => stroke.id === "s1"),
		true,
		"real ink survives the purge",
	);

	const press = (
		key: string,
		mods: { shift?: boolean; ctrl?: boolean; alt?: boolean } = {},
	) => {
		window.document.dispatchEvent(
			new KeyboardEvent("keydown", {
				key,
				bubbles: true,
				shiftKey: !!mods.shift,
				ctrlKey: !!mods.ctrl,
				altKey: !!mods.alt,
			}),
		);
	};
	const release = (key: string) => {
		window.document.dispatchEvent(
			new KeyboardEvent("keyup", { key, bubbles: true }),
		);
	};

	/* --- default bindings reproduce the old shortcuts --------------------- */

	press("e");
	assert.equal(plugin.tool, "eraser", "E still picks the eraser");
	press("p");
	assert.equal(plugin.tool, "pen");

	/* --- pen / hand toggle key (Q) --------------------------------------- */

	press("q");
	assert.equal(plugin.tool, "hand", "Q flips pen -> hand");
	press("q");
	assert.equal(plugin.tool, "pen", "Q flips hand -> pen");
	press("e");
	press("q");
	assert.equal(plugin.tool, "pen", "from another tool Q falls back to the pen");

	const paletteColor = plugin.settings.palette[0];
	plugin.setColor("#ffffff");
	press("1");
	assert.equal(plugin.settings.penColor, paletteColor, "1 still picks palette 1");

	/* --- hold-to-erase --------------------------------------------------- */

	plugin.setTool("highlighter");
	press("f");
	assert.equal(plugin.tool, "eraser", "holding the temp key erases");
	release("f");
	assert.equal(plugin.tool, "highlighter", "release restores the previous tool");

	// A stroke in flight must never be hijacked: the tool would change under
	// the session that already captured its kind.
	const live = pageEl.querySelector<HTMLElement>(".pdf-ink-canvas-live")!;
	assert.ok(live, "live canvas mounted");
	plugin.setTool("pen");
	controller.setDrawing(true);
	live.dispatchEvent(pointer("pointerdown", 100, 200));
	assert.equal(controller.isStroking, true);
	press("f");
	assert.equal(plugin.tool, "pen", "no tool switch mid-stroke");
	release("f");
	live.dispatchEvent(pointer("pointerup", 100, 200));
	await wait(10);

	/* --- rebinding moves the action -------------------------------------- */

	plugin.setTool("highlighter");
	plugin.settings.keyBindings = { "tool:pen": "k" };
	press("k");
	assert.equal(plugin.tool, "pen", "the new key works");
	plugin.setTool("highlighter");
	press("p");
	assert.equal(plugin.tool, "highlighter", "the old key is free again");

	/* --- clearing a binding disables it ---------------------------------- */

	plugin.settings.keyBindings = { "tool:pen": "" };
	plugin.setTool("hand");
	press("p");
	assert.equal(plugin.tool, "hand", "an unbound action does nothing");

	/* --- temp key can be cleared ----------------------------------------- */

	plugin.settings.keyBindings = {};
	plugin.settings.tempEraserKey = "";
	plugin.setTool("pen");
	press("f");
	assert.equal(plugin.tool, "pen", "no temp eraser when the key is empty");
	plugin.settings.tempEraserKey = "f";

	/* --- gestures can be switched off for the tablet ---------------------- */

	plugin.settings.tapGestureMenuEnabled = false;
	plugin.setTool("select");
	live.dispatchEvent(pointer("pointerdown", 300, 300));
	live.dispatchEvent(pointer("pointerup", 300, 300));
	live.dispatchEvent(pointer("pointerdown", 300, 300));
	live.dispatchEvent(pointer("pointerup", 300, 300));
	await wait(10);
	assert.equal(
		containerEl.querySelector(".pdf-ink-selection-menu"),
		null,
		"the double tap menu does not open when gestures are off",
	);

	/* --- a tool key bound as "按住" behaves like the side button --------- */

	plugin.settings.keyHolds = { "tool:eraser": true };
	plugin.setTool("pen");
	press("e");
	assert.equal(plugin.tool, "eraser", "holding E erases");
	release("e");
	assert.equal(plugin.tool, "pen", "letting go of E restores the pen");

	// Modifiers coming and going must not lose the keyup.
	plugin.settings.keyBindings = { "tool:eraser": "shift+e" };
	plugin.settings.keyHolds = { "tool:eraser": true };
	plugin.setTool("pen");
	press("E", { shift: true });
	assert.equal(plugin.tool, "eraser");
	release("e");
	assert.equal(plugin.tool, "pen", "keyup without Shift is still honoured");

	plugin.settings.keyBindings = {};
	plugin.settings.keyHolds = {};

	/* --- side button mapped to right click (mouse channel) --------------- */

	plugin.settings.tempEraserMouse = "right";
	plugin.setTool("pen");
	// Side button held while the tip lands: buttons = tip(1) | right(2).
	window.dispatchEvent(
		pointer("pointerdown", 420, 420, { pointerType: "pen", buttons: 3 }),
	);
	assert.equal(plugin.tool, "eraser", "the held right button erases");
	window.dispatchEvent(
		pointer("pointerup", 420, 420, { pointerType: "pen", buttons: 0 }),
	);
	assert.equal(plugin.tool, "pen", "releasing it restores the previous tool");
	// A plain mouse right-click must not switch anything.
	window.dispatchEvent(pointer("pointerdown", 420, 420, { buttons: 2 }));
	assert.equal(plugin.tool, "pen", "mouse right click is left alone");
	plugin.settings.tempEraserMouse = "off";

	/* --- tablet preset turns both gestures off --------------------------- */

	plugin.settings.eraserHoldEnabled = true;
	plugin.settings.tapGestureMenuEnabled = true;
	await plugin.applyInputMode("tablet");
	assert.equal(plugin.settings.inputMode, "tablet");
	assert.equal(plugin.settings.eraserHoldEnabled, false, "pressure gesture off");
	assert.equal(plugin.settings.tapGestureMenuEnabled, false, "tap gesture off");
	assert.ok(plugin.settings.eraserHoldMs >= 1200, "threshold raised for pen tablets");

	await plugin.applyInputMode("touch");
	assert.equal(plugin.settings.eraserHoldEnabled, true);
	assert.equal(plugin.settings.tapGestureMenuEnabled, true);

	/* --- releasing the hold mid-stroke latches until the tip lifts ------- */

	plugin.setTool("pen");
	controller.setDrawing(true);
	press("f");
	assert.equal(plugin.tool, "eraser", "hold arms the eraser");
	live.dispatchEvent(pointer("pointerdown", 300, 500));
	live.dispatchEvent(pointer("pointermove", 320, 520));
	release("f");
	assert.equal(
		plugin.tool,
		"eraser",
		"releasing mid-stroke keeps erasing (no pen trail while the pen is down)",
	);
	live.dispatchEvent(pointer("pointermove", 340, 540));
	live.dispatchEvent(pointer("pointerup", 340, 540));
	assert.equal(plugin.tool, "pen", "the tool comes back when the tip lifts");

	// A driver that reports "tip up" on side-button release would now try to
	// paint the tail of that movement; the guard swallows that one press.
	const strokesBeforeGuard = controller.doc.layers[0].strokes.length;
	live.dispatchEvent(pointer("pointerdown", 400, 400));
	live.dispatchEvent(pointer("pointermove", 500, 500));
	live.dispatchEvent(pointer("pointerup", 500, 500));
	assert.equal(
		controller.doc.layers[0].strokes.length,
		strokesBeforeGuard,
		"the tail press paints nothing",
	);
	await wait(300);
	live.dispatchEvent(pointer("pointerdown", 420, 420));
	live.dispatchEvent(pointer("pointermove", 520, 520));
	live.dispatchEvent(pointer("pointerup", 520, 520));
	await wait(10);
	assert.ok(
		controller.doc.layers[0].strokes.length > strokesBeforeGuard,
		"drawing works again once the guard expires",
	);

	/* --- ink moves freely past the page edge (no per-point clamp) -------- */

	// A real stroke (the mid-stroke check above only pokes the pen down).
	plugin.setTool("pen");
	controller.setDrawing(true);
	live.dispatchEvent(pointer("pointerdown", 120, 120));
	live.dispatchEvent(pointer("pointermove", 180, 200));
	live.dispatchEvent(pointer("pointermove", 240, 280));
	live.dispatchEvent(pointer("pointerup", 240, 280));
	await wait(10);

	const strokesNow = controller.doc.layers[0].strokes;
	assert.ok(strokesNow.length > 0, "the stroke committed");
	const spanOf = (list: any[]) => {
		let x0 = Infinity;
		let x1 = -Infinity;
		for (const stroke of list) {
			for (let i = 0; i + 1 < stroke.points.length; i += 3) {
				x0 = Math.min(x0, stroke.points[i]);
				x1 = Math.max(x1, stroke.points[i]);
			}
			for (const ring of stroke.rings ?? []) {
				for (let i = 0; i + 1 < ring.length; i += 2) {
					x0 = Math.min(x0, ring[i]);
					x1 = Math.max(x1, ring[i]);
				}
			}
		}
		return { x0, x1 };
	};
	plugin.setTool("select");
	assert.ok(controller.selectAll(), "select all ink");
	const beforeSpan = spanOf(strokesNow);
	for (let i = 0; i < 80; i++) controller.nudgeSelection(20, 0);
	const afterSpan = spanOf(strokesNow);
	assert.ok(
		afterSpan.x0 > 1.2,
		`ink keeps moving past the page edge (x0=${afterSpan.x0.toFixed(2)})`,
	);
	assert.ok(
		Math.abs(afterSpan.x1 - afterSpan.x0 - (beforeSpan.x1 - beforeSpan.x0)) < 1e-6,
		"moving never squashes the ink against the border",
	);

	/* --- a cancelled toolbar drag stops following the pen ---------------- */

	const toolbarEl = containerEl.querySelector<HTMLElement>(".pdf-ink-toolbar");
	assert.ok(toolbarEl, "toolbar mounted");
	toolbarEl!.style.left = "40px";
	toolbarEl!.style.top = "40px";
	toolbarEl!.dispatchEvent(pointer("pointerdown", 100, 100));
	window.dispatchEvent(pointer("pointercancel", 100, 100));
	const leftAfterCancel = toolbarEl!.style.left;
	window.dispatchEvent(pointer("pointermove", 400, 400));
	assert.equal(
		toolbarEl!.style.left,
		leftAfterCancel,
		"a cancelled drag must not leave the toolbar glued to the pen",
	);

	/* --- switching the UI language relabels the open toolbar ------------- */

	const penButton = containerEl.querySelector<HTMLElement>('[data-tool="pen"]');
	assert.ok(penButton, "pen button mounted");
	plugin.settings.language = "en";
	assert.equal(plugin.applyLanguage(), true, "switching to English is a change");
	assert.match(
		penButton!.getAttribute("aria-label") ?? "",
		/^Pen \(P/,
		"the pen tooltip followed the language switch",
	);
	plugin.settings.language = "zh";
	assert.equal(plugin.applyLanguage(), true, "switching back is a change too");
	assert.equal(
		penButton!.getAttribute("aria-label"),
		"钢笔 (P，双击/长按开面板)",
		"the pen tooltip is Chinese again",
	);

	await plugin.onunload();
});

/**
 * Split layout: a note beside the PDF. A stroke has to start in the capture
 * phase, and the `preventDefault()` that requires also hides the click from
 * Obsidian, so the plugin has to activate the clicked leaf itself. Without that
 * the note stayed the active, focused leaf: no PDF was "active", the key handler
 * bailed out, and every tool shortcut was typed into the note.
 */
test("1.2 split layout: a stroke on the PDF takes the leaf and the focus", async () => {
	const adapter = new FakeAdapter();
	const workspace = new FakeWorkspace();
	const app = { workspace, vault: { adapter, on: () => ({}) } };

	/* --- the note: marked active, its editor holding the focus ----------- */

	const noteLeafEl = window.document.createElement("div");
	noteLeafEl.className = "workspace-leaf mod-active";
	window.document.body.appendChild(noteLeafEl);
	const noteContentEl = window.document.createElement("div");
	noteContentEl.className = "view-content";
	noteLeafEl.appendChild(noteContentEl);
	const editor = window.document.createElement("div");
	editor.setAttribute("contenteditable", "true");
	editor.setAttribute("tabindex", "-1");
	noteContentEl.appendChild(editor);
	editor.focus();
	assert.equal(window.document.activeElement, editor, "the note editor starts focused");

	/* --- the PDF in the other pane --------------------------------------- */

	const pdfLeafEl = window.document.createElement("div");
	pdfLeafEl.className = "workspace-leaf";
	window.document.body.appendChild(pdfLeafEl);
	const containerEl = window.document.createElement("div");
	containerEl.className = "view-content";
	pdfLeafEl.appendChild(containerEl);
	const pdfContainer = window.document.createElement("div");
	pdfContainer.className = "pdf-container";
	containerEl.appendChild(pdfContainer);
	const scrollEl = window.document.createElement("div");
	scrollEl.className = "pdf-viewer-container";
	pdfContainer.appendChild(scrollEl);
	const viewerEl = window.document.createElement("div");
	viewerEl.className = "pdfViewer";
	scrollEl.appendChild(viewerEl);
	const pageEl = window.document.createElement("div");
	pageEl.className = "page";
	pageEl.dataset.pageNumber = "1";
	const wrapper = window.document.createElement("div");
	wrapper.className = "canvasWrapper";
	wrapper.appendChild(window.document.createElement("canvas"));
	pageEl.appendChild(wrapper);
	viewerEl.appendChild(pageEl);

	const file = { path: "资料/分屏.pdf", extension: "pdf", basename: "分屏" };
	const view = { getViewType: () => "pdf", containerEl, file };
	const leaf: any = { view, containerEl: pdfLeafEl };
	const noteLeaf: any = {
		view: { getViewType: () => "markdown", containerEl: noteContentEl },
		containerEl: noteLeafEl,
	};
	workspace.leaves.push(noteLeaf, leaf);
	workspace.activeLeaf = noteLeaf;

	const { default: PdfInkPlugin } = require(findBuiltPlugin());
	const plugin: any = new (PdfInkPlugin as any)();
	plugin.app = app;
	await plugin.onload();

	await waitFor(() => Boolean(plugin.controllers.get(leaf)));
	const controller = plugin.controllers.get(leaf);
	assert.ok(controller, "the PDF leaf gets a controller");
	await waitFor(() => !!controller.doc);
	assert.equal(
		plugin.getActiveController(),
		null,
		"no PDF counts as active while the note is",
	);

	/* --- one pen touch on the page --------------------------------------- */

	pageEl.dispatchEvent(pointer("pointerdown", 120, 160, { pointerType: "pen" }));
	assert.ok(workspace.activated.includes(leaf), "the click activates the PDF leaf");
	assert.equal(workspace.activeLeaf, leaf, "the workspace agrees it is active");
	assert.notEqual(
		window.document.activeElement,
		editor,
		"the note editor loses the focus",
	);
	assert.equal(
		plugin.getActiveController(),
		controller,
		"the PDF owns the shortcuts now",
	);
	pageEl.dispatchEvent(pointer("pointerup", 120, 160, { pointerType: "pen" }));
	await wait(10);

	/* --- and the shortcuts reach it -------------------------------------- */

	plugin.setTool("pen");
	window.document.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true }));
	assert.equal(plugin.tool, "eraser", "E reaches the PDF instead of the note");

	await plugin.onunload();
});

/**
 * The header button: one per PDF tab, living in the view's own header. It is
 * the only entry point that exists even when the floating toolbar is hidden,
 * and it carries the two per-tab switches.
 */
test("1.3 header button: per-tab toolbar and annotation switches", async () => {
	const adapter = new FakeAdapter();
	const workspace = new FakeWorkspace();
	const app = { workspace, vault: { adapter, on: () => ({}) } };

	const leafEl = window.document.createElement("div");
	leafEl.className = "workspace-leaf";
	window.document.body.appendChild(leafEl);
	const leafContentEl = window.document.createElement("div");
	leafContentEl.className = "workspace-leaf-content";
	leafEl.appendChild(leafContentEl);
	const headerEl = window.document.createElement("div");
	headerEl.className = "view-header";
	leafContentEl.appendChild(headerEl);
	const actionsEl = window.document.createElement("div");
	actionsEl.className = "view-actions";
	headerEl.appendChild(actionsEl);

	const containerEl = window.document.createElement("div");
	containerEl.className = "view-content";
	leafContentEl.appendChild(containerEl);
	const pdfContainer = window.document.createElement("div");
	pdfContainer.className = "pdf-container";
	containerEl.appendChild(pdfContainer);
	const scrollEl = window.document.createElement("div");
	scrollEl.className = "pdf-viewer-container";
	pdfContainer.appendChild(scrollEl);
	const viewerEl = window.document.createElement("div");
	viewerEl.className = "pdfViewer";
	scrollEl.appendChild(viewerEl);
	const pageEl = window.document.createElement("div");
	pageEl.className = "page";
	pageEl.dataset.pageNumber = "1";
	const wrapper = window.document.createElement("div");
	wrapper.className = "canvasWrapper";
	wrapper.appendChild(window.document.createElement("canvas"));
	pageEl.appendChild(wrapper);
	viewerEl.appendChild(pageEl);

	const file = { path: "资料/头部按钮.pdf", extension: "pdf", basename: "头部按钮" };
	const view = { getViewType: () => "pdf", containerEl, file };
	const leaf: any = { view };
	workspace.leaves.push(leaf);
	workspace.activeLeaf = leaf;

	const { default: PdfInkPlugin } = require(findBuiltPlugin());
	const plugin: any = new (PdfInkPlugin as any)();
	plugin.app = app;
	await plugin.onload();

	const controller = plugin.controllers.get(leaf);
	assert.ok(controller, "controller attaches");
	await waitFor(() => !!controller.doc);

	/* --- the button is in the view header -------------------------------- */

	const button = actionsEl.querySelector<HTMLElement>(".pdf-ink-header-btn");
	assert.ok(button, "the header button is mounted into .view-actions");
	assert.ok(controller.toolbar, "the floating toolbar starts visible");

	/* --- the button is not rewritten when the tree changes --------------- */

	// Mounting from inside the DOM observer used to rewrite the button's icon on
	// every mutation, which re-entered the observer and froze the whole workspace.
	let buttonWrites = 0;
	const watcher = new window.MutationObserver(() => {
		buttonWrites++;
	});
	watcher.observe(button!, { childList: true, subtree: true, attributes: true });
	for (let i = 0; i < 5; i++) {
		const probe = window.document.createElement("div");
		leafContentEl.appendChild(probe);
		probe.remove();
		await wait(10);
	}
	await wait(40);
	watcher.disconnect();
	assert.equal(buttonWrites, 0, "the header button must not be rewritten on mutations");
	assert.equal(
		actionsEl.querySelectorAll(".pdf-ink-header-btn").length,
		1,
		"exactly one header button stays mounted",
	);
	assert.equal(
		actionsEl.querySelector(".pdf-ink-header-btn"),
		button,
		"and it is the same element, not a re-created one",
	);

	/* --- one click turns this tab into a plain reader --------------------- */

	const strokesNow = () =>
		controller.doc.layers.reduce(
			(sum: number, layer: any) => sum + layer.strokes.length,
			0,
		);
	plugin.setTool("pen");
	const strokesBefore = strokesNow();
	const committed = pageEl.querySelector<HTMLElement>(".pdf-ink-canvas-committed");
	assert.ok(committed, "ink canvases are mounted");

	button!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
	assert.equal(controller.annotationsOn, false, "the tab becomes a plain reader");
	assert.equal(controller.toolbar, null, "the toolbar is gone");
	assert.equal(containerEl.querySelector(".pdf-ink-toolbar"), null, "and its DOM with it");
	assert.equal(
		committed!.style.display,
		"",
		"the ink that is already on the page stays visible",
	);
	assert.equal(button!.classList.contains("is-active"), false, "the button goes dark");

	// The pen cursor must be gone as well: hovering used to re-apply it.
	pageEl.dispatchEvent(pointer("pointermove", 120, 160, {}));
	await wait(10);
	assert.equal(
		controller.containerEl.classList.contains("pdf-ink-cursor-point"),
		false,
		"the pen cursor does not come back on hover",
	);
	assert.equal(
		controller.containerEl.classList.contains("pdf-ink-cursor-ring"),
		false,
		"and neither does the brush ring",
	);

	pageEl.dispatchEvent(pointer("pointerdown", 120, 160, { pointerType: "pen" }));
	pageEl.dispatchEvent(pointer("pointermove", 200, 200, { pointerType: "pen" }));
	pageEl.dispatchEvent(pointer("pointerup", 200, 200, { pointerType: "pen" }));
	await wait(10);
	assert.equal(controller.isStroking, false, "no stroke may start");
	assert.equal(strokesNow(), strokesBefore, "and nothing is written");
	window.document.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true }));
	assert.equal(plugin.tool, "pen", "tool keys are ignored while the tab is a reader");
	assert.equal(
		controller.containerEl.classList.contains("pdf-ink-pen-mode"),
		false,
		"the plain reader keeps no pen styling either",
	);

	/* --- one more click makes it an annotation surface again -------------- */

	button!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
	assert.equal(controller.annotationsOn, true);
	assert.ok(controller.toolbar, "the toolbar returns");
	assert.equal(button!.classList.contains("is-active"), true, "the button lights up");
	pageEl.dispatchEvent(pointer("pointerdown", 120, 160, { pointerType: "pen" }));
	assert.equal(controller.isStroking, true, "the pen works again");
	pageEl.dispatchEvent(pointer("pointerup", 120, 160, { pointerType: "pen" }));
	await wait(10);

	await plugin.onunload();
	assert.equal(
		window.document.querySelector(".pdf-ink-header-btn"),
		null,
		"unloading removes the header button",
	);
});

/**
 * Restoring a few PDF tabs at startup: only the active tab is in the document,
 * the others are restored detached. Those tabs used to lose their controller (in
 * a detached tab the container is not connected) and therefore never got the
 * header button — it appeared only after opening a brand new tab.
 */
test("1.5 restored PDF tabs: a background tab keeps its controller and button", async () => {
	const adapter = new FakeAdapter();
	const workspace = new FakeWorkspace();
	const app = { workspace, vault: { adapter, on: () => ({}) } };

	const buildPdfLeaf = (name: string, connected: boolean) => {
		const leafEl = window.document.createElement("div");
		leafEl.className = "workspace-leaf";
		if (connected) window.document.body.appendChild(leafEl);
		const content = window.document.createElement("div");
		content.className = "workspace-leaf-content";
		leafEl.appendChild(content);
		const header = window.document.createElement("div");
		header.className = "view-header";
		content.appendChild(header);
		const actions = window.document.createElement("div");
		actions.className = "view-actions";
		header.appendChild(actions);
		const containerEl = window.document.createElement("div");
		containerEl.className = "view-content";
		content.appendChild(containerEl);
		const pdfContainer = window.document.createElement("div");
		pdfContainer.className = "pdf-container";
		containerEl.appendChild(pdfContainer);
		const viewer = window.document.createElement("div");
		viewer.className = "pdfViewer";
		pdfContainer.appendChild(viewer);
		const page = window.document.createElement("div");
		page.className = "page";
		page.dataset.pageNumber = "1";
		const wrapper = window.document.createElement("div");
		wrapper.className = "canvasWrapper";
		wrapper.appendChild(window.document.createElement("canvas"));
		page.appendChild(wrapper);
		viewer.appendChild(page);
		const view = {
			getViewType: () => "pdf",
			containerEl,
			file: { path: `资料/${name}.pdf`, extension: "pdf", basename: name },
		};
		return { leaf: { view } as any, actions };
	};

	const active = buildPdfLeaf("前台", true);
	const background = buildPdfLeaf("后台", false);
	workspace.leaves.push(active.leaf, background.leaf);
	workspace.activeLeaf = active.leaf;

	const { default: PdfInkPlugin } = require(findBuiltPlugin());
	const plugin: any = new (PdfInkPlugin as any)();
	plugin.app = app;
	await plugin.onload();
	await waitFor(() => Boolean(plugin.controllers.get(background.leaf)));

	assert.ok(
		plugin.controllers.get(background.leaf),
		"the restored background tab keeps a controller",
	);
	const button = background.actions.querySelector(".pdf-ink-header-btn");
	assert.ok(button, "and it gets its header button while still detached");

	// A later scan must not tear the detached tab down and re-create the button.
	plugin.scanLeaves();
	await wait(40);
	assert.equal(
		background.actions.querySelector(".pdf-ink-header-btn"),
		button,
		"rescanning keeps the very same button",
	);

	await plugin.onunload();
});

/**
 * Hand tool + Shift is one gesture with two meanings: sideways zooms, up/down
 * pans. The axis is picked from the first few pixels and then locked, so a
 * slightly crooked drag cannot zoom and scroll at the same time.
 */
test("1.6 hand tool: a Shift drag locks to one axis", async () => {
	const adapter = new FakeAdapter();
	const workspace = new FakeWorkspace();
	const app = { workspace, vault: { adapter, on: () => ({}) } };

	const containerEl = window.document.createElement("div");
	containerEl.className = "view-content";
	window.document.body.appendChild(containerEl);
	const pdfContainer = window.document.createElement("div");
	pdfContainer.className = "pdf-container";
	containerEl.appendChild(pdfContainer);
	const scroller = window.document.createElement("div");
	scroller.className = "pdf-viewer-container";
	pdfContainer.appendChild(scroller);
	const viewerEl = window.document.createElement("div");
	viewerEl.className = "pdfViewer";
	scroller.appendChild(viewerEl);
	const pageEl = window.document.createElement("div");
	pageEl.className = "page";
	pageEl.dataset.pageNumber = "1";
	const wrapper = window.document.createElement("div");
	wrapper.className = "canvasWrapper";
	wrapper.appendChild(window.document.createElement("canvas"));
	pageEl.appendChild(wrapper);
	viewerEl.appendChild(pageEl);

	// jsdom has no layout, so scrollTop is stubbed to whatever the code writes.
	let scrollTop = 300;
	Object.defineProperty(scroller, "scrollTop", {
		configurable: true,
		get: () => scrollTop,
		set: (value: number) => {
			scrollTop = value;
		},
	});

	const file = { path: "资料/手势.pdf", extension: "pdf", basename: "手势" };
	const view = { getViewType: () => "pdf", containerEl, file };
	const leaf: any = { view };
	workspace.leaves.push(leaf);
	workspace.activeLeaf = leaf;

	const { default: PdfInkPlugin } = require(findBuiltPlugin());
	const plugin: any = new (PdfInkPlugin as any)();
	plugin.app = app;
	await plugin.onload();
	await waitFor(() => Boolean(plugin.controllers.get(leaf)));
	const controller = plugin.controllers.get(leaf);
	assert.ok(controller, "controller attaches");

	plugin.setTool("pen");
	controller.setDrawing(true);
	const live = pageEl.querySelector<HTMLElement>(".pdf-ink-canvas-live");
	assert.ok(live, "live canvas mounted");

	// One stroke, so the tab has a document and a layer to work on.
	live!.dispatchEvent(pointer("pointerdown", 300, 300, { pointerType: "pen", pressure: 0.5 }));
	window.dispatchEvent(pointer("pointermove", 320, 300, { pointerType: "pen", pressure: 0.5 }));
	window.dispatchEvent(pointer("pointerup", 320, 300, { pointerType: "pen", pressure: 0 }));
	await wait(20);
	assert.ok(controller.doc !== null, "document ready");
	plugin.setTool("hand");

	/* --- sideways: zoom, and the page must not move ---------------------- */

	scroller.scrollTop = 300;
	live!.dispatchEvent(pointer("pointerdown", 100, 200, { pointerType: "pen", shiftKey: true }));
	window.dispatchEvent(
		pointer("pointermove", 170, 204, { pointerType: "pen", shiftKey: true, buttons: 1 }),
	);
	assert.equal(scrollTop, 300, "a sideways drag never pans");
	assert.equal(
		controller.containerEl.classList.contains("pdf-ink-zooming"),
		true,
		"and it is a zoom",
	);
	window.dispatchEvent(pointer("pointerup", 170, 204, { pointerType: "pen", shiftKey: true }));

	/* --- up/down: pan, and it must not zoom ------------------------------ */

	scroller.scrollTop = 300;
	live!.dispatchEvent(pointer("pointerdown", 100, 200, { pointerType: "pen", shiftKey: true }));
	window.dispatchEvent(
		pointer("pointermove", 104, 140, { pointerType: "pen", shiftKey: true, buttons: 1 }),
	);
	assert.equal(scrollTop, 360, "dragging up scrolls the page down by the same distance");
	assert.equal(
		controller.containerEl.classList.contains("pdf-ink-panning"),
		true,
		"and it is a pan",
	);
	assert.equal(
		controller.containerEl.classList.contains("pdf-ink-zooming"),
		false,
		"the zoom mode was dropped for this gesture",
	);
	window.dispatchEvent(pointer("pointerup", 104, 140, { pointerType: "pen", shiftKey: true }));

	/* --- the axis stays locked once chosen ------------------------------- */

	scroller.scrollTop = 300;
	live!.dispatchEvent(pointer("pointerdown", 100, 200, { pointerType: "pen", shiftKey: true }));
	// Decide "pan" with a small downward move, then travel mostly sideways.
	window.dispatchEvent(
		pointer("pointermove", 102, 230, { pointerType: "pen", shiftKey: true, buttons: 1 }),
	);
	assert.equal(scrollTop, 270, "the move that picks the axis already pans");
	window.dispatchEvent(
		pointer("pointermove", 260, 240, { pointerType: "pen", shiftKey: true, buttons: 1 }),
	);
	assert.equal(scrollTop, 260, "the drag stays a pan even when it turns sideways");
	assert.equal(
		controller.containerEl.classList.contains("pdf-ink-zooming"),
		false,
		"and never becomes a zoom",
	);
	window.dispatchEvent(pointer("pointerup", 260, 240, { pointerType: "pen", shiftKey: true }));

	await plugin.onunload();
});

test("1.4 header button: a PDF tab without a viewer still gets the button", async () => {
	const adapter = new FakeAdapter();
	const workspace = new FakeWorkspace();
	const app = { workspace, vault: { adapter, on: () => ({}) } };

	const leafEl = window.document.createElement("div");
	leafEl.className = "workspace-leaf";
	window.document.body.appendChild(leafEl);
	const leafContentEl = window.document.createElement("div");
	leafContentEl.className = "workspace-leaf-content";
	leafEl.appendChild(leafContentEl);
	const headerEl = window.document.createElement("div");
	headerEl.className = "view-header";
	leafContentEl.appendChild(headerEl);
	const actionsEl = window.document.createElement("div");
	actionsEl.className = "view-actions";
	headerEl.appendChild(actionsEl);
	// No .pdfViewer anywhere: this is the tab that has not finished opening.
	const containerEl = window.document.createElement("div");
	containerEl.className = "view-content";
	leafContentEl.appendChild(containerEl);

	const view = { getViewType: () => "pdf", containerEl, file: null };
	const leaf: any = { view };
	workspace.leaves.push(leaf);
	workspace.activeLeaf = leaf;

	const { default: PdfInkPlugin } = require(findBuiltPlugin());
	const plugin: any = new (PdfInkPlugin as any)();
	plugin.app = app;
	await plugin.onload();

	// The first scan is deferred so startup stays cheap; wait for it.
	await waitFor(() => Boolean(actionsEl.querySelector(".pdf-ink-header-btn")));
	assert.ok(
		actionsEl.querySelector(".pdf-ink-header-btn"),
		"the header button does not wait for the viewer",
	);
	assert.equal(
		containerEl.querySelector(".pdf-ink-toolbar"),
		null,
		"there is no floating toolbar without a viewer",
	);

	await plugin.onunload();
});
