import { setIcon, setTooltip } from "obsidian";
import type { PresetKind } from "../brush";
import type { PdfInkController } from "../controller";
import type PdfInkPlugin from "../main";
import type { Brush } from "../main";
import type { ToolName } from "../types";
import { BrushPanel } from "./brush-panel";
import { clamp } from "../util";

const TOOLS: Array<{ tool: ToolName; icon: string; label: string }> = [
	{ tool: "pen", icon: "pencil", label: "钢笔 (P，双击/长按开面板)" },
	{ tool: "highlighter", icon: "highlighter", label: "荧光笔 (H，双击/长按开面板)" },
	{ tool: "eraser", icon: "eraser", label: "橡皮 (E，双击/长按切换模式)" },
	{ tool: "select", icon: "mouse-pointer-2", label: "选择（双击/长按切换模式）" },
	{ tool: "hand", icon: "hand", label: "拖拽页面 (G)" },
];

const SHAPES: Array<{ tool: ToolName; icon: string; label: string }> = [
	{ tool: "line", icon: "minus", label: "直线" },
	{ tool: "arrow", icon: "arrow-up-right", label: "箭头" },
	{ tool: "rect", icon: "square", label: "矩形" },
	{ tool: "ellipse", icon: "circle", label: "椭圆" },
];

export class PdfInkToolbar {
	readonly el: HTMLElement;

	private readonly toolButtons = new Map<ToolName, HTMLButtonElement>();
	private undoButton!: HTMLButtonElement;
	private redoButton!: HTMLButtonElement;
	private colorDot!: HTMLElement;
	private colorChip!: HTMLElement;
	private quickRow!: HTMLElement;
	private layerChip!: HTMLButtonElement;
	private toggleButton!: HTMLButtonElement;
	private layoutButton!: HTMLButtonElement;
	private brushPanel: BrushPanel | null = null;
	private holdTimer: number | null = null;
	/*\n	 * update() runs on every commit (each finished stroke). Re-writing the same\n	 * text / icon / swatches each time is pure DOM churn: it costs us a little\n	 * and, worse, wakes up every plugin that watches the workspace with a\n	 * MutationObserver. Cache what was rendered and only touch what changed.\n	 */
	private lastToggleIcon = "";
	private lastQuickSignature = "";
	private lastChipText = "";
	private lastLayoutLabel = "";
	private modeMenu: HTMLElement | null = null;
	private modeMenuAnchor: HTMLElement | null = null;
	private collapsed = false;
	private suppressClick = false;
	private dragState: {
		startX: number;
		startY: number;
		left: number;
		top: number;
		active: boolean;
	} | null = null;
	/** pointer ids the drag grabbed, so they can always be released again */
	private readonly capturedPointers = new Set<number>();
	private readonly doc: Document;
	private readonly onOutsidePointerDown = (event: PointerEvent) => {
		const target = event.target as Node;
		if (this.modeMenu) {
			if (
				!this.modeMenu.contains(target) &&
				!this.modeMenuAnchor?.contains(target)
			) {
				this.closeModeMenu();
			}
		}
	};

	constructor(
		private readonly plugin: PdfInkPlugin,
		private readonly controller: PdfInkController,
	) {
		const host = controller.containerEl;
		host.classList.add("pdf-ink-host");
		this.doc = host.ownerDocument;
		this.el = this.doc.createElement("div");
		this.el.className = "pdf-ink-toolbar";
		this.el.addEventListener("pointerdown", (event) =>
			this.onToolbarPointerDown(event),
		);
		this.el.addEventListener(
			"click",
			(event) => {
				if (!this.suppressClick) return;
				this.suppressClick = false;
				event.preventDefault();
				event.stopPropagation();
			},
			true,
		);
		this.build();
		host.appendChild(this.el);
		this.applySavedPosition();
		this.doc.addEventListener("pointerdown", this.onOutsidePointerDown, true);
		this.update();
	}

	private build(): void {
		this.toggleButton = this.doc.createElement("button");
		this.toggleButton.type = "button";
		this.toggleButton.className = "pdf-ink-btn pdf-ink-toggle-btn";
		setIcon(this.toggleButton, "chevrons-right");
		setTooltip(this.toggleButton, "收起工具栏");
		this.toggleButton.addEventListener("click", (event) => {
			event.stopPropagation();
			this.setCollapsed(!this.collapsed);
		});
		this.el.appendChild(this.toggleButton);

		for (const entry of TOOLS) {
			this.toolButton(entry.tool, entry.icon, entry.label);
		}

		this.divider();

		for (const entry of SHAPES) {
			this.toolButton(entry.tool, entry.icon, entry.label);
		}

		this.divider();

		this.colorChip = this.doc.createElement("div");
		this.colorChip.className = "pdf-ink-color-chip";
		this.colorDot = this.doc.createElement("span");
		this.colorDot.className = "pdf-ink-color-dot";
		this.colorChip.appendChild(this.colorDot);
		this.el.appendChild(this.colorChip);

		this.quickRow = this.doc.createElement("div");
		this.quickRow.className = "pdf-ink-quick-colors";
		this.el.appendChild(this.quickRow);

		this.divider();

		this.undoButton = this.button("undo-2", "撤销 (Ctrl+Z)", () => this.controller.undo());
		this.redoButton = this.button("redo-2", "重做 (Ctrl+Shift+Z)", () =>
			this.controller.redo(),
		);

		this.divider();

		const layersButton = this.button("layers", "图层面板", () =>
			this.plugin.toggleLayersPanel(this.el),
		);
		layersButton.classList.add("pdf-ink-layers-button");
		this.layoutButton = this.button("layout-template", "切换工具栏布局", () =>
			this.plugin.cycleToolbarLayout(),
		);

		this.layerChip = this.doc.createElement("button");
		this.layerChip.className = "pdf-ink-layer-chip";
		this.layerChip.type = "button";
		this.layerChip.addEventListener("click", () =>
			this.plugin.toggleLayersPanel(this.el),
		);
		setTooltip(this.layerChip, "当前图层，点击打开图层面板");
		this.el.appendChild(this.layerChip);
	}

	private toolButton(tool: ToolName, icon: string, label: string): void {
		const button = this.button(icon, label, () => this.plugin.setTool(tool));
		button.dataset.tool = tool;
		this.toolButtons.set(tool, button);
		if (tool === "select") this.bindModeMenu(button);
		else if (tool === "eraser" || tool === "pen" || tool === "highlighter") {
			this.bindBrushPanel(button, tool);
		}
	}

	/** Double click or long press opens the per-brush panel (single click still applies). */
	private bindBrushPanel(anchor: HTMLElement, kind: PresetKind): void {
		const open = (): void => {
			this.plugin.setTool(kind);
			this.brushPanel ??= new BrushPanel(this.plugin, this.doc);
			this.brushPanel.open(anchor, kind);
		};
		anchor.addEventListener("dblclick", (event) => {
			event.preventDefault();
			event.stopPropagation();
			open();
		});
		anchor.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) return;
			this.armHold(() => {
				// Swallow the click that follows the long press, but never longer
				// than that one click (or the next toolbar click would be lost).
				this.suppressClick = true;
				window.setTimeout(() => {
					this.suppressClick = false;
				}, 400);
				open();
			});
		});
		for (const type of ["pointercancel", "pointerleave"]) {
			anchor.addEventListener(type, () => this.cancelHold());
		}
	}

	private armHold(callback: () => void, delay = 420): void {
		this.cancelHold();
		this.holdTimer = window.setTimeout(() => {
			this.holdTimer = null;
			callback();
		}, delay);
	}

	private cancelHold(): void {
		if (this.holdTimer !== null) {
			window.clearTimeout(this.holdTimer);
			this.holdTimer = null;
		}
	}

	private bindModeMenu(anchor: HTMLElement): void {
		let timer: number | null = null;
		const open = () => this.openModeMenu(anchor);
		anchor.addEventListener("dblclick", (event) => {
			event.preventDefault();
			event.stopPropagation();
			open();
		});
		anchor.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) return;
			if (timer !== null) window.clearTimeout(timer);
			timer = window.setTimeout(() => {
				timer = null;
				open();
			}, 420);
		});
		const cancel = () => {
			if (timer !== null) {
				window.clearTimeout(timer);
				timer = null;
			}
		};
		anchor.addEventListener("pointerup", cancel);
		anchor.addEventListener("pointerleave", cancel);
	}

	private openModeMenu(anchor: HTMLElement): void {
		this.closeModeMenu();
		const settings = this.plugin.settings;
		const groups: Array<{
			title: string;
			axis: "scope" | "region" | "select";
			options: Array<{ value: string; label: string }>;
		}> = [
			{
				title: "选择区域",
				axis: "select",
				options: [
					{ value: "rect", label: "矩形选择" },
					{ value: "lasso", label: "套索选择" },
				],
			},
		];
		const menu = this.doc.createElement("div");
		menu.className = "pdf-ink-mode-menu is-floating";
		for (const group of groups) {
			const heading = this.doc.createElement("div");
			heading.className = "pdf-ink-mode-heading";
			heading.textContent = group.title;
			menu.appendChild(heading);
			const current =
				group.axis === "scope"
					? settings.eraserScope
					: group.axis === "region"
						? settings.eraserRegion
						: settings.selectMode;
			for (const option of group.options) {
				const row = this.doc.createElement("button");
				row.type = "button";
				row.className = "pdf-ink-mode-option";
				if (option.value === current) row.classList.add("is-selected");
				const radio = this.doc.createElement("span");
				radio.className = "pdf-ink-radio";
				if (option.value === current) radio.classList.add("is-selected");
				const label = this.doc.createElement("span");
				label.textContent = option.label;
				row.append(radio, label);
				row.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					this.plugin.setSelectMode(option.value as "rect" | "lasso");
					this.refreshModeMenu(menu, groups);
				});
				menu.appendChild(row);
			}
		}
		// Rendered on the body with fixed positioning so the menu is never
		// clipped by the PDF container, the window edge or the toolbar itself.
		this.doc.body.appendChild(menu);
		const anchorRect = anchor.getBoundingClientRect();
		const menuRect = menu.getBoundingClientRect();
		const toolbarRect = this.el.getBoundingClientRect();
		const gap = 6;
		const candidates = [
			{ left: anchorRect.right + gap, top: anchorRect.top },
			{ left: anchorRect.left - gap - menuRect.width, top: anchorRect.top },
			{ left: anchorRect.left, top: anchorRect.bottom + gap },
			{ left: anchorRect.left, top: anchorRect.top - gap - menuRect.height },
		];
		let best = { left: 0, top: 0 };
		let bestScore = Number.NEGATIVE_INFINITY;
		for (const candidate of candidates) {
			const left = clamp(candidate.left, 8, Math.max(8, window.innerWidth - menuRect.width - 8));
			const top = clamp(candidate.top, 8, Math.max(8, window.innerHeight - menuRect.height - 8));
			const box = { left, top, width: menuRect.width, height: menuRect.height };
			const overlap = overlapArea(box, toolbarRect);
			const shifted = Math.abs(left - candidate.left) + Math.abs(top - candidate.top);
			const score = -overlap * 3 - shifted;
			if (score > bestScore) {
				bestScore = score;
				best = { left, top };
			}
		}
		menu.style.left = `${best.left}px`;
		menu.style.top = `${best.top}px`;
		this.modeMenu = menu;
		this.modeMenuAnchor = anchor;
	}

	private refreshModeMenu(
		menu: HTMLElement,
		groups: Array<{ axis: "scope" | "region" | "select"; options: Array<{ value: string }> }>,
	): void {
		const settings = this.plugin.settings;
		const rows = menu.querySelectorAll<HTMLButtonElement>(".pdf-ink-mode-option");
		let index = 0;
		for (const group of groups) {
			const current = settings.selectMode;
			for (const option of group.options) {
				const row = rows[index++];
				if (!row) continue;
				const selected = option.value === current;
				row.classList.toggle("is-selected", selected);
				row.querySelector(".pdf-ink-radio")?.classList.toggle("is-selected", selected);
			}
		}
		void groups;
	}

	private closeModeMenu(): void {
		this.modeMenu?.remove();
		this.modeMenu = null;
		this.modeMenuAnchor = null;
	}

	private button(
		icon: string,
		label: string,
		onClick: () => void,
	): HTMLButtonElement {
		const button = this.doc.createElement("button");
		button.type = "button";
		button.className = "pdf-ink-btn";
		button.setAttribute("aria-label", label);
		setIcon(button, icon);
		setTooltip(button, label);
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			onClick();
		});
		this.el.appendChild(button);
		return button;
	}

	private divider(): void {
		const divider = this.doc.createElement("div");
		divider.className = "pdf-ink-divider";
		this.el.appendChild(divider);
	}

	/** The one-row "quick colors" strip: click picks, long press replaces. */
	private renderQuickColors(): void {
		const row = this.quickRow;
		const visible = this.plugin.tool !== "eraser" && this.plugin.tool !== "select";
		// Rebuilding the row on every commit is a mutation storm for whoever
		// observes the workspace, so only rebuild when something really changed.
		const current = visible ? this.currentBrush().color.toLowerCase() : "";
		const signature = `${visible ? "1" : "0"}|${current}|${this.plugin.settings.quickColors.join(",")}`;
		if (signature === this.lastQuickSignature) return;
		this.lastQuickSignature = signature;
		while (row.firstChild) row.removeChild(row.firstChild);
		row.classList.toggle("is-hidden", !visible);
		if (!visible) return;
		this.plugin.settings.quickColors.forEach((color, index) => {
			const swatch = this.doc.createElement("button");
			swatch.type = "button";
			swatch.className = "pdf-ink-quick-color";
			swatch.style.backgroundColor = color;
			swatch.setAttribute("aria-label", `${color}（长按替换为当前笔色）`);
			setTooltip(swatch, `${color}（长按替换为当前笔色）`);
			if (color.toLowerCase() === current) swatch.classList.add("is-active");
			swatch.addEventListener("pointerdown", (event) => {
				if (event.button !== 0) return;
				this.armHold(() => {
					this.suppressClick = true;
					this.plugin.setQuickColor(index, this.currentBrush().color);
				}, 480);
			});
			swatch.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.plugin.setColor(color);
			});
			row.appendChild(swatch);
		});
	}

	/** Called when a stroke starts: popovers must not stay in the way. */
	closePopovers(): void {
		this.cancelHold();
		this.closeModeMenu();
		this.brushPanel?.close();
	}

	private applySavedPosition(): void {
		const position = this.plugin.settings.toolbarPos;
		if (!position) return;
		const host = this.controller.containerEl;
		const hostRect = host.getBoundingClientRect();
		if (hostRect.width < 50 || hostRect.height < 50) return;
		this.applyPosition(
			clamp(position.x, 0, Math.max(0, hostRect.width - this.el.offsetWidth)),
			clamp(position.y, 0, Math.max(0, hostRect.height - this.el.offsetHeight)),
		);
	}

	private applyPosition(left: number, top: number): void {
		this.el.style.left = `${left}px`;
		this.el.style.top = `${top}px`;
		this.el.style.right = "auto";
		this.el.style.bottom = "auto";
	}

	private onToolbarPointerDown(event: PointerEvent): void {
		event.stopPropagation();
		if (event.button !== 0) return;
		const target = event.target as HTMLElement | null;
		// Sliders / color inputs need their own drag behaviour.
		if (target?.closest("input")) return;
		const hostRect = this.controller.containerEl.getBoundingClientRect();
		const rect = this.el.getBoundingClientRect();
		this.dragState = {
			startX: event.clientX,
			startY: event.clientY,
			left: rect.left - hostRect.left,
			top: rect.top - hostRect.top,
			active: false,
		};
		window.addEventListener("pointermove", this.onToolbarDragMove, true);
		window.addEventListener("pointerup", this.onToolbarDragEnd, true);
		window.addEventListener("pointercancel", this.onToolbarDragEnd, true);
	}

	private readonly onToolbarDragMove = (event: PointerEvent): void => {
		const state = this.dragState;
		if (!state) return;
		const dx = event.clientX - state.startX;
		const dy = event.clientY - state.startY;
		if (!state.active) {
			if (Math.hypot(dx, dy) < 4) return;
			state.active = true;
			// A drag must never also count as a long press.
			this.cancelHold();
			this.applyPosition(state.left, state.top);
			try {
				this.el.setPointerCapture?.(event.pointerId);
				this.capturedPointers.add(event.pointerId);
			} catch {
				/* optional */
			}
		}
		event.preventDefault();
		const hostRect = this.controller.containerEl.getBoundingClientRect();
		const left = clamp(
			state.left + dx,
			0,
			Math.max(0, hostRect.width - this.el.offsetWidth),
		);
		const top = clamp(
			state.top + dy,
			0,
			Math.max(0, hostRect.height - this.el.offsetHeight),
		);
		this.applyPosition(left, top);
	};

	private readonly onToolbarDragEnd = (event?: PointerEvent): void => {
		// A cancelled pointer (pen left the tablet, the driver switched modes,
		// pdf.js re-rendered) still has to be cleaned up. Returning early here
		// used to leave the window listeners and the pointer capture behind: the
		// toolbar then kept following the pen and, once captured, the PDF page
		// never saw a pointerdown again — the pen looked dead until a reload.
		const cancelled = event?.type === "pointercancel";
		const touchCancel = cancelled && event?.pointerType === "touch";
		this.releaseDragCapture();
		// A plain click ends here: the long-press timer must not survive it, or
		// the panel pops open half a second after the user clicked a brush.
		this.cancelHold();
		const state = this.dragState;
		this.dragState = null;
		window.removeEventListener("pointermove", this.onToolbarDragMove, true);
		window.removeEventListener("pointerup", this.onToolbarDragEnd, true);
		window.removeEventListener("pointercancel", this.onToolbarDragEnd, true);
		if (!state?.active) return;
		if (cancelled) {
			// Don't persist a half-finished drag as the new toolbar position.
			this.applyPosition(state.left, state.top);
			return;
		}
		if (touchCancel) return;
		this.suppressClick = true;
		window.setTimeout(() => {
			this.suppressClick = false;
		}, 50);
		this.plugin.setToolbarPosition({
			x: parseFloat(this.el.style.left) || 0,
			y: parseFloat(this.el.style.top) || 0,
		});
	};

	private releaseDragCapture(): void {
		try {
			for (const pointerId of this.capturedPointers) {
				if (this.el.hasPointerCapture?.(pointerId)) {
					this.el.releasePointerCapture(pointerId);
				}
			}
		} catch {
			/* element may be detached */
		}
		this.capturedPointers.clear();
	}

	setCollapsed(value: boolean): void {
		this.collapsed = value;
		this.el.classList.toggle("is-collapsed", value);
		this.updateToggleIcon();
		if (!value) this.update();
	}

	private updateToggleIcon(): void {
		const vertical = this.plugin.settings.toolbarLayout === "vertical";
		const icon = this.collapsed
			? vertical
				? "chevrons-up"
				: "chevrons-left"
			: vertical
				? "chevrons-down"
				: "chevrons-right";
		if (this.lastToggleIcon !== icon) {
			this.lastToggleIcon = icon;
			setIcon(this.toggleButton, icon);
			setTooltip(this.toggleButton, this.collapsed ? "展开工具栏" : "收起工具栏");
		}
	}

	private currentBrush(): Brush {
		return this.plugin.brushFor(this.plugin.tool);
	}

	update(): void {
		const layout = this.plugin.settings.toolbarLayout ?? "horizontal";
		this.el.classList.toggle("pdf-ink-layout-vertical", layout === "vertical");
		this.el.classList.toggle("pdf-ink-layout-square", layout === "square");
		this.updateToggleIcon();
		for (const [tool, button] of this.toolButtons) {
			button.classList.toggle("is-active", this.plugin.tool === tool);
		}
		const brush = this.currentBrush();
		this.colorDot.style.backgroundColor = brush.color;
		this.colorChip.classList.toggle("is-dim", this.plugin.tool === "eraser");
		this.renderQuickColors();

		this.undoButton.disabled = !this.controller.history.canUndo;
		this.redoButton.disabled = !this.controller.history.canRedo;
		const layoutLabel = `切换工具栏布局（当前：${
			this.plugin.settings.toolbarLayout === "vertical"
				? "纵向"
				: this.plugin.settings.toolbarLayout === "square"
					? "方形"
					: "横向"
		}）`;
		if (this.layoutButton && this.lastLayoutLabel !== layoutLabel) {
			this.lastLayoutLabel = layoutLabel;
			this.layoutButton.setAttribute("aria-label", layoutLabel);
		}

		const doc = this.controller.doc;
		const layer = doc ? doc.layers.find((entry) => entry.id === doc.activeLayerId) : null;
		const chipText = layer ? `图层：${layer.name}` : "无图层";
		if (this.lastChipText !== chipText) {
			this.lastChipText = chipText;
			this.layerChip.textContent = chipText;
		}
		this.layerChip.classList.toggle(
			"is-warning",
			!!layer && (!layer.visible || layer.locked),
		);
	}

	destroy(): void {
		this.cancelHold();
		this.brushPanel?.close();
		this.brushPanel = null;
		this.closeModeMenu();
		this.doc.removeEventListener("pointerdown", this.onOutsidePointerDown, true);
		this.el.remove();
	}
}

function overlapArea(
	box: { left: number; top: number; width: number; height: number },
	other: DOMRect | { left: number; top: number; right: number; bottom: number },
): number {
	const right = "width" in box ? box.left + box.width : 0;
	const bottom = box.top + box.height;
	const otherRight = "right" in other ? other.right : 0;
	const otherBottom = "bottom" in other ? other.bottom : 0;
	const w = Math.min(right, otherRight) - Math.max(box.left, other.left);
	const h = Math.min(bottom, otherBottom) - Math.max(box.top, other.top);
	return w > 0 && h > 0 ? w * h : 0;
}
