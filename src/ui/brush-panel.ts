import { Notice, setIcon, setTooltip } from "obsidian";
import type { BrushPreset, EraserPreset, PresetKind } from "../brush";
import { REGION_LABELS, SCOPE_LABELS, formatWidth } from "../brush";
import { hexToHsl, hslToHex, normalizeHex } from "../color";
import { renderStroke } from "../geometry";
import type PdfInkPlugin from "../main";
import type { EraserRegion, EraserScope, Stroke } from "../types";
import { clamp } from "../util";
import { boxOf, placeFloating } from "./place";

const TITLES: Record<PresetKind, string> = {
	pen: "钢笔",
	highlighter: "荧光笔",
	eraser: "橡皮",
};

const HOLD_MS = 420;
const PREVIEW_WIDTH = 214;
const PREVIEW_HEIGHT = 52;

/** Long-press state shared by every chip / swatch in the panel. */
interface HoldState {
	timer: number | null;
	fired: boolean;
	startX: number;
	startY: number;
}

/**
 * Per-brush popover: presets, editable palette, width, opacity and a live ink
 * preview. Opened by double click or long press on a brush button, so a single
 * click still just applies the tool.
 */
export class BrushPanel {
	private el: HTMLElement | null = null;
	private anchor: HTMLElement | null = null;
	private kind: PresetKind = "pen";
	private readonly doc: Document;
	private menu: HTMLElement | null = null;
	private presetRow: HTMLElement | null = null;
	private paletteGrid: HTMLElement | null = null;
	private widthInput: HTMLInputElement | null = null;
	private widthValue: HTMLElement | null = null;
	private opacityInput: HTMLInputElement | null = null;
	private opacityValue: HTMLElement | null = null;
	private preview: HTMLCanvasElement | null = null;
	private readonly segments = new Map<string, HTMLButtonElement>();
	private hold: HoldState = { timer: null, fired: false, startX: 0, startY: 0 };
	private lastPaletteSignature = "";
	private colorEditor: HTMLElement | null = null;
	private readonly onEditorOutside = (event: PointerEvent): void => {
		const target = event.target as Node | null;
		if (target && this.colorEditor?.contains(target)) return;
		this.closeColorEditor();
	};

	private readonly onOutside = (event: PointerEvent): void => {
		const target = event.target as Node | null;
		if (!target) return;
		if (this.el?.contains(target)) return;
		if (this.menu?.contains(target)) return;
		// The colour editor lives on document.body, not inside the panel, so it
		// has to be excluded by hand — otherwise the first click on a slider
		// counts as "clicked outside" and closes both.
		if (this.colorEditor?.contains(target)) return;
		if (target instanceof HTMLElement && target.closest("input[type=color]")) return;
		this.close();
	};

	private readonly onKey = (event: KeyboardEvent): void => {
		if (event.key === "Escape") this.close();
	};

	constructor(
		private readonly plugin: PdfInkPlugin,
		doc: Document,
	) {
		this.doc = doc;
	}

	get isOpen(): boolean {
		return Boolean(this.el);
	}

	toggle(anchor: HTMLElement, kind: PresetKind): void {
		if (this.el && this.anchor === anchor && this.kind === kind) {
			this.close();
			return;
		}
		this.open(anchor, kind);
	}

	open(anchor: HTMLElement, kind: PresetKind): void {
		this.close();
		this.anchor = anchor;
		this.kind = kind;
		const el = this.doc.createElement("div");
		el.className = "pdf-ink-brush-panel";
		el.addEventListener("pointerdown", (event) => {
			// The page must not start a stroke because the panel was touched.
			event.stopPropagation();
		});
		this.el = el;
		// A new panel means a new (empty) palette grid: force a rebuild.
		this.lastPaletteSignature = "";

		const title = this.doc.createElement("div");
		title.className = "pdf-ink-panel-title";
		title.textContent = TITLES[kind];
		el.appendChild(title);

		this.presetRow = this.doc.createElement("div");
		this.presetRow.className = "pdf-ink-panel-presets";
		el.appendChild(this.presetRow);

		if (kind === "eraser") this.buildEraserBody(el);
		else this.buildBrushBody(el);

		this.doc.body.appendChild(el);
		this.refresh();
		placeFloating(el, anchor, {
			gap: 8,
			avoid: [boxOf(anchor.closest(".pdf-ink-toolbar") ?? anchor)],
		});
		window.setTimeout(() => {
			this.doc.addEventListener("pointerdown", this.onOutside, true);
			this.doc.addEventListener("keydown", this.onKey, true);
		}, 0);
	}

	close(): void {
		this.closeMenu();
		this.closeColorEditor();
		if (!this.el) return;
		this.doc.removeEventListener("pointerdown", this.onOutside, true);
		this.doc.removeEventListener("keydown", this.onKey, true);
		this.cancelHold();
		this.el.remove();
		this.el = null;
		this.anchor = null;
		this.presetRow = null;
		this.paletteGrid = null;
		this.widthInput = null;
		this.widthValue = null;
		this.opacityInput = null;
		this.opacityValue = null;
		this.preview = null;
		this.segments.clear();
	}

	/* ------------------------------------------------------------------ */
	/* Building blocks                                                     */
	/* ------------------------------------------------------------------ */

	private buildBrushBody(el: HTMLElement): void {
		this.heading(el, "调色板");
		this.paletteGrid = this.doc.createElement("div");
		this.paletteGrid.className = "pdf-ink-panel-grid";
		el.appendChild(this.paletteGrid);

		this.heading(el, "粗细");
		this.widthInput = this.slider(el, 0.5, 20, 0.5, (value) =>
			this.plugin.setBrushWidth(this.kind, value),
		);
		this.widthValue = this.widthInput.nextElementSibling as HTMLElement;

		this.heading(el, "不透明度");
		this.opacityInput = this.slider(el, 10, 100, 5, (value) =>
			this.plugin.setBrushOpacity(this.kind === "highlighter" ? "highlighter" : "pen", value / 100),
		);
		this.opacityValue = this.opacityInput.nextElementSibling as HTMLElement;

		const preview = this.doc.createElement("canvas");
		preview.className = "pdf-ink-panel-preview";
		el.appendChild(preview);
		this.preview = preview;
	}

	private buildEraserBody(el: HTMLElement): void {
		this.heading(el, "擦除方式");
		this.segmented(
			el,
			"scope",
			[
				{ value: "partial", label: SCOPE_LABELS.partial },
				{ value: "whole", label: SCOPE_LABELS.whole },
			],
			(value) => this.plugin.setEraserScope(value as EraserScope),
		);

		this.heading(el, "擦除区域");
		this.segmented(
			el,
			"region",
			[
				{ value: "free", label: REGION_LABELS.free },
				{ value: "rect", label: REGION_LABELS.rect },
				{ value: "lasso", label: REGION_LABELS.lasso },
			],
			(value) => this.plugin.setEraserRegion(value as EraserRegion),
		);

		this.heading(el, "橡皮半径");
		this.widthInput = this.slider(el, 4, 48, 1, (value) =>
			this.plugin.setBrushWidth("eraser", value),
		);
		this.widthValue = this.widthInput.nextElementSibling as HTMLElement;

		const preview = this.doc.createElement("canvas");
		preview.className = "pdf-ink-panel-preview";
		el.appendChild(preview);
		this.preview = preview;
	}

	private heading(parent: HTMLElement, text: string): void {
		const heading = this.doc.createElement("div");
		heading.className = "pdf-ink-panel-heading";
		heading.textContent = text;
		parent.appendChild(heading);
	}

	private slider(
		parent: HTMLElement,
		min: number,
		max: number,
		step: number,
		onInput: (value: number) => void,
	): HTMLInputElement {
		const row = this.doc.createElement("div");
		row.className = "pdf-ink-panel-slider";
		const input = this.doc.createElement("input");
		input.type = "range";
		input.min = String(min);
		input.max = String(max);
		input.step = String(step);
		input.addEventListener("input", () => {
			onInput(Number(input.value));
			this.refresh();
		});
		const value = this.doc.createElement("span");
		value.className = "pdf-ink-panel-value";
		row.append(input, value);
		parent.appendChild(row);
		return input;
	}

	private segmented(
		parent: HTMLElement,
		axis: string,
		options: Array<{ value: string; label: string }>,
		onPick: (value: string) => void,
	): void {
		const row = this.doc.createElement("div");
		row.className = "pdf-ink-panel-segment";
		for (const option of options) {
			const button = this.doc.createElement("button");
			button.type = "button";
			button.className = "pdf-ink-panel-seg";
			button.textContent = option.label;
			button.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				onPick(option.value);
				this.refresh();
			});
			row.appendChild(button);
			this.segments.set(`${axis}:${option.value}`, button);
		}
		parent.appendChild(row);
	}

	/* ------------------------------------------------------------------ */
	/* Refresh                                                             */
	/* ------------------------------------------------------------------ */

	private refresh(): void {
		if (!this.el) return;
		this.renderPresets();
		if (this.kind === "eraser") this.refreshEraser();
		else this.refreshBrush();
		this.drawPreview();
	}

	private refreshBrush(): void {
		const kind = this.kind === "highlighter" ? "highlighter" : "pen";
		const brush = this.plugin.brushFor(kind);
		if (this.paletteGrid) this.renderPalette(this.paletteGrid, brush.color);
		if (this.widthInput) {
			const text = formatWidth(brush.widthPx);
			if (this.doc.activeElement !== this.widthInput) this.widthInput.value = text;
			if (this.widthValue) this.widthValue.textContent = `${text}px`;
		}
		if (this.opacityInput) {
			const percent = String(Math.round(brush.opacity * 100));
			if (this.doc.activeElement !== this.opacityInput) this.opacityInput.value = percent;
			if (this.opacityValue) this.opacityValue.textContent = `${percent}%`;
		}
	}

	private refreshEraser(): void {
		const settings = this.plugin.settings;
		for (const [key, button] of this.segments) {
			const [axis, value] = key.split(":");
			const active =
				axis === "scope" ? settings.eraserScope === value : settings.eraserRegion === value;
			button.classList.toggle("is-active", active);
			button.setAttribute("aria-pressed", String(active));
		}
		if (this.widthInput) {
			const text = formatWidth(settings.eraserWidth);
			if (this.doc.activeElement !== this.widthInput) this.widthInput.value = text;
			if (this.widthValue) this.widthValue.textContent = `${text}px`;
		}
	}

	/* ------------------------------------------------------------------ */
	/* Presets                                                             */
	/* ------------------------------------------------------------------ */

	private renderPresets(): void {
		const row = this.presetRow;
		if (!row) return;
		while (row.firstChild) row.removeChild(row.firstChild);
		for (const preset of this.plugin.presetsOf(this.kind)) {
			const chip = this.presetChip(preset);
			row.appendChild(chip);
		}
		const add = this.doc.createElement("button");
		add.type = "button";
		add.className = "pdf-ink-preset-add";
		add.textContent = "＋";
		setTooltip(add, "把当前笔刷状态存成预设");
		add.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.plugin.addPreset(this.kind);
			this.refresh();
		});
		row.appendChild(add);
	}

	private presetChip(preset: BrushPreset | EraserPreset): HTMLElement {
		const chip = this.doc.createElement("button");
		chip.type = "button";
		chip.className = "pdf-ink-preset";
		if (this.isActivePreset(preset)) chip.classList.add("is-active");
		const swatch = this.doc.createElement("span");
		swatch.className = "pdf-ink-preset-swatch";
		if (this.kind === "eraser") {
			swatch.classList.add("is-eraser");
			setIcon(swatch, "eraser");
		} else {
			swatch.setCssStyles({ backgroundColor: (preset as BrushPreset).color });
		}
		const name = this.doc.createElement("span");
		name.className = "pdf-ink-preset-name";
		name.textContent = preset.name;
		chip.append(swatch, name);
		chip.title =
			this.kind === "eraser"
				? `${REGION_LABELS[(preset as EraserPreset).region]} · ${
						SCOPE_LABELS[(preset as EraserPreset).scope]
					} · 半径 ${formatWidth((preset as EraserPreset).widthPx)}px`
				: `${(preset as BrushPreset).color} · ${formatWidth((preset as BrushPreset).widthPx)}px · ${Math.round((preset as BrushPreset).opacity * 100)}%`;
		chip.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		this.bindTapHold(
			chip,
			() => {
				this.plugin.applyPreset(this.kind, preset);
				this.refresh();
			},
			() => this.openPresetMenu(chip, preset),
		);
		// Mouse users reach for the right button, not for a long press.
		chip.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.cancelHold();
			this.openPresetMenu(chip, preset);
		});
		return chip;
	}

	private isActivePreset(preset: BrushPreset | EraserPreset): boolean {
		const settings = this.plugin.settings;
		if (this.kind === "eraser") {
			const eraser = preset as EraserPreset;
			return (
				settings.eraserRegion === eraser.region &&
				settings.eraserScope === eraser.scope &&
				Math.abs(settings.eraserWidth - eraser.widthPx) < 0.01
			);
		}
		const brush = preset as BrushPreset;
		const current = this.plugin.brushFor(this.kind === "highlighter" ? "highlighter" : "pen");
		return (
			brush.color.toLowerCase() === current.color.toLowerCase() &&
			Math.abs(brush.widthPx - current.widthPx) < 0.01 &&
			Math.abs(brush.opacity - current.opacity) < 0.01
		);
	}

	private openPresetMenu(anchor: HTMLElement, preset: BrushPreset | EraserPreset): void {
		this.closeMenu();
		const menu = this.doc.createElement("div");
		menu.className = "pdf-ink-preset-menu";
		const items: Array<[string, () => void]> = [
			[
				"重命名",
				() => {
					this.closeMenu();
					this.startRename(anchor, preset);
				},
			],
			[
				"覆盖为当前",
				() => {
					this.plugin.overwritePreset(this.kind, preset.id);
					this.closeMenu();
					this.refresh();
				},
			],
			[
				"删除",
				() => {
					this.plugin.deletePreset(this.kind, preset.id);
					this.closeMenu();
					this.refresh();
				},
			],
		];
		for (const [label, action] of items) {
			const row = this.doc.createElement("button");
			row.type = "button";
			row.className = "pdf-ink-preset-menu-item";
			row.textContent = label;
			row.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				action();
			});
			menu.appendChild(row);
		}
		this.doc.body.appendChild(menu);
		const rect = anchor.getBoundingClientRect();
		menu.setCssStyles({ left: `${Math.round(rect.left)}px` });
		menu.setCssStyles({ top: `${Math.round(rect.bottom + 4)}px` });
		menu.setCssStyles({ position: "fixed" });
		this.menu = menu;
		const menuRect = menu.getBoundingClientRect();
		if (menuRect.bottom > window.innerHeight - 8) {
			menu.setCssStyles({ top: `${Math.round(rect.top - menuRect.height - 4)}px` });
		}
		if (menuRect.right > window.innerWidth - 8) {
			menu.setCssStyles({ left: `${Math.round(window.innerWidth - menuRect.width - 8)}px` });
		}
	}

	private closeMenu(): void {
		this.menu?.remove();
		this.menu = null;
	}

	/** Renames in place: the chip turns into an input until Enter / blur. */
	private startRename(chip: HTMLElement, preset: BrushPreset | EraserPreset): void {
		while (chip.firstChild) chip.removeChild(chip.firstChild);
		const input = this.doc.createElement("input");
		input.type = "text";
		input.className = "pdf-ink-preset-rename";
		input.value = preset.name;
		input.maxLength = 24;
		const commit = (save: boolean): void => {
			if (save) this.plugin.renamePreset(this.kind, preset.id, input.value);
			this.refresh();
		};
		input.addEventListener("keydown", (event) => {
			event.stopPropagation();
			if (event.key === "Enter") commit(true);
			else if (event.key === "Escape") commit(false);
		});
		input.addEventListener("blur", () => commit(true));
		chip.appendChild(input);
		input.focus();
		input.select();
	}

	/* ------------------------------------------------------------------ */
	/* Palette                                                             */
	/* ------------------------------------------------------------------ */

	private renderPalette(grid: HTMLElement, current: string): void {
		// Rebuilding the grid on every refresh replaces the buttons under the
		// pointer, which silently kills double-click (the two clicks land on
		// different elements). Rebuild only when the colour list itself changed.
		const signature = this.plugin.settings.palette.join(",");
		if (signature === this.lastPaletteSignature && grid.childElementCount > 0) {
			for (const el of Array.from(grid.querySelectorAll<HTMLElement>(".pdf-ink-panel-swatch"))) {
				const index = el.dataset.index;
				if (index === undefined) continue;
				const color = this.plugin.settings.palette[Number(index)];
				el.classList.toggle("is-active", color?.toLowerCase() === current.toLowerCase());
			}
			return;
		}
		this.lastPaletteSignature = signature;
		while (grid.firstChild) grid.removeChild(grid.firstChild);
		this.plugin.settings.palette.forEach((color, index) => {
			const swatch = this.doc.createElement("button");
			swatch.type = "button";
			swatch.className = "pdf-ink-panel-swatch";
			swatch.setCssStyles({ backgroundColor: color });
			swatch.dataset.index = String(index);
			swatch.setAttribute("aria-label", color);
			setTooltip(swatch, `${color}（长按改色，拖出面板删除）`);
			if (color.toLowerCase() === current.toLowerCase()) swatch.classList.add("is-active");
			this.bindPaletteSwatch(swatch, index, color);
			grid.appendChild(swatch);
		});
		const add = this.doc.createElement("button");
		add.type = "button";
		add.className = "pdf-ink-panel-swatch pdf-ink-swatch-add";
		add.textContent = "＋";
		setTooltip(add, "把当前笔色加进调色板");
		add.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			const brush = this.plugin.brushFor(this.kind === "highlighter" ? "highlighter" : "pen");
			if (this.plugin.settings.palette.some((entry) => entry.toLowerCase() === brush.color.toLowerCase())) {
				new Notice("[PDF Ink] 这个颜色已经在调色板里了");
				return;
			}
			this.plugin.addPaletteColor(brush.color);
			this.refresh();
		});
		grid.appendChild(add);
	}

	/** Click applies, long press opens the native picker, drag-out deletes. */
	private bindPaletteSwatch(swatch: HTMLElement, index: number, color: string): void {
		const kind = this.kind === "highlighter" ? "highlighter" : "pen";
		let dragging = false;
		let pointerId = -1;
		const clean = (): void => {
			window.removeEventListener("pointermove", onMove, true);
			window.removeEventListener("pointerup", onUp, true);
		};
		const onMove = (event: PointerEvent): void => {
			if (event.pointerId !== pointerId) return;
			const dx = event.clientX - this.hold.startX;
			const dy = event.clientY - this.hold.startY;
			if (!dragging && Math.hypot(dx, dy) > 10) {
				dragging = true;
				this.cancelHold();
				swatch.classList.add("is-dragging");
			}
			if (dragging) swatch.setCssStyles({ transform: `translate(${dx}px, ${dy}px)` });
		};
		const onUp = (event: PointerEvent): void => {
			if (event.pointerId !== pointerId) return;
			clean();
			this.cancelHold();
			swatch.classList.remove("is-dragging");
			swatch.setCssStyles({ transform: "" });
			const panel = this.el;
			if (dragging && panel) {
				const rect = panel.getBoundingClientRect();
				const outside =
					event.clientX < rect.left ||
					event.clientX > rect.right ||
					event.clientY < rect.top ||
					event.clientY > rect.bottom;
				if (outside) {
					this.plugin.removePaletteColor(index);
					this.refresh();
					return;
				}
			}
			if (this.hold.fired) return;
			if (!dragging) {
				this.plugin.setBrushColor(this.kind === "highlighter" ? "highlighter" : "pen", color);
				this.refresh();
			}
		};
		swatch.addEventListener("dblclick", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.plugin.setBrushColor(kind, color);
			this.refresh();
			this.openColorEditor(index, swatch);
		});
		swatch.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) return;
			event.preventDefault();
			event.stopPropagation();
			pointerId = event.pointerId;
			dragging = false;
			this.startHold(event.clientX, event.clientY, () => {
				// Long press picks that swatch first, then opens its editor,
				// otherwise the editor would edit a colour the brush is not using.
				this.plugin.setBrushColor(kind, color);
				this.refresh();
				this.openColorEditor(index, swatch);
			});
			window.addEventListener("pointermove", onMove, true);
			window.addEventListener("pointerup", onUp, true);
		});
		// Same for colours: right click edits that swatch instead of a long press.
		swatch.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.cancelHold();
			this.plugin.setBrushColor(kind, color);
			this.refresh();
			this.openColorEditor(index, swatch);
		});
	}

	private openColorEditor(index: number, anchor: HTMLElement): void {
		this.closeColorEditor();
		const initial = normalizeHex(this.plugin.settings.palette[index] ?? "#000000") ?? "#000000";
		const hsl = hexToHsl(initial);
		let hue = hsl.h;
		let sat = hsl.s;
		let light = hsl.l;

		const el = this.doc.createElement("div");
		el.className = "pdf-ink-color-editor";
		el.addEventListener("pointerdown", (event) => event.stopPropagation());

		const preview = this.doc.createElement("div");
		preview.className = "pdf-ink-color-editor-preview";
		preview.setCssStyles({ backgroundColor: initial });
		el.appendChild(preview);

		const hexInput = this.doc.createElement("input");
		hexInput.type = "text";
		hexInput.className = "pdf-ink-color-hex";
		hexInput.value = initial;
		hexInput.spellcheck = false;

		const applyHex = (hex: string, updateInput: boolean): void => {
			preview.setCssStyles({ backgroundColor: hex });
			if (updateInput) hexInput.value = hex;
			this.plugin.setPaletteSlot(index, hex);
			this.refresh();
		};
		const fromSliders = (): void => applyHex(hslToHex(hue, sat, light), true);

		const row = (
			label: string,
			max: number,
			value: number,
			onInput: (next: number) => void,
		): HTMLInputElement => {
			const wrap = this.doc.createElement("div");
			wrap.className = "pdf-ink-color-row";
			const text = this.doc.createElement("span");
			text.textContent = label;
			const slider = this.doc.createElement("input");
			slider.type = "range";
			slider.min = "0";
			slider.max = String(max);
			slider.step = "1";
			slider.value = String(value);
			slider.addEventListener("input", () => onInput(Number(slider.value)));
			wrap.append(text, slider);
			el.appendChild(wrap);
			return slider;
		};

		const paintGradients = (): void => {
			// background-image only: the stylesheet keeps `background-size: 100% 6px`
			// so the colour band stays a thin stripe centred under the thumb. The
			// `background` shorthand would reset that size and fatten the band.
			hueSlider.setCssStyles({
				backgroundImage: "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
			});
			satSlider.setCssStyles({ backgroundImage: `linear-gradient(to right, hsl(${hue} 0% ${light}%), hsl(${hue} 100% ${light}%))` });
			lightSlider.setCssStyles({ backgroundImage: `linear-gradient(to right, #000, hsl(${hue} ${sat}% 50%), #fff)` });
		};

		const hueSlider = row("色相", 360, hue, (next) => {
			hue = next;
			paintGradients();
			fromSliders();
		});
		const satSlider = row("饱和", 100, sat, (next) => {
			sat = next;
			paintGradients();
			fromSliders();
		});
		const lightSlider = row("明度", 100, light, (next) => {
			light = next;
			paintGradients();
			fromSliders();
		});
		paintGradients();

		el.appendChild(hexInput);
		hexInput.addEventListener("keydown", (event) => {
			event.stopPropagation();
			if (event.key !== "Enter") return;
			const normalized = normalizeHex(hexInput.value);
			if (!normalized) {
				hexInput.value = normalizeHex(preview.style.backgroundColor) ?? initial;
				return;
			}
			const next = hexToHsl(normalized);
			hue = next.h;
			sat = next.s;
			light = next.l;
			hueSlider.value = String(hue);
			satSlider.value = String(sat);
			lightSlider.value = String(light);
			paintGradients();
			applyHex(normalized, true);
		});
		hexInput.addEventListener("blur", () => {
			const normalized = normalizeHex(hexInput.value);
			if (normalized) hexInput.value = normalized;
		});

		this.doc.body.appendChild(el);
		placeFloating(el, anchor, {
			gap: 8,
			avoid: [boxOf(anchor.closest(".pdf-ink-toolbar") ?? anchor)],
		});
		this.colorEditor = el;
		window.setTimeout(() => {
			this.doc.addEventListener("pointerdown", this.onEditorOutside, true);
		}, 0);
	}

	private closeColorEditor(): void {
		if (!this.colorEditor) return;
		this.doc.removeEventListener("pointerdown", this.onEditorOutside, true);
		this.colorEditor.remove();
		this.colorEditor = null;
	}

	/* ------------------------------------------------------------------ */
	/* Tap / hold                                                          */
	/* ------------------------------------------------------------------ */

	private startHold(clientX: number, clientY: number, onHold: () => void): void {
		this.cancelHold();
		this.hold.startX = clientX;
		this.hold.startY = clientY;
		this.hold.fired = false;
		this.hold.timer = window.setTimeout(() => {
			this.hold.timer = null;
			this.hold.fired = true;
			try {
				onHold();
			} catch (error) {
				void error;
			}
			// The click that follows a long press must be swallowed, but only
			// once: a platform without that click would otherwise eat the next tap.
			window.setTimeout(() => {
				this.hold.fired = false;
			}, 700);
		}, HOLD_MS);
	}

	private cancelHold(): void {
		if (this.hold.timer !== null) {
			window.clearTimeout(this.hold.timer);
			this.hold.timer = null;
		}
	}

	/** Click → tap action; press and hold → hold action (no click afterwards). */
	private bindTapHold(el: HTMLElement, onTap: () => void, onHold: () => void): void {
		el.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) return;
			event.preventDefault();
			event.stopPropagation();
			this.startHold(event.clientX, event.clientY, onHold);
		});
		for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
			el.addEventListener(type, () => {
				if (this.hold.timer !== null) this.cancelHold();
			});
		}
		el.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (this.hold.fired) {
				this.hold.fired = false;
				return;
			}
			onTap();
		});
	}

	/* ------------------------------------------------------------------ */
	/* Preview                                                             */
	/* ------------------------------------------------------------------ */

	private drawPreview(): void {
		const canvas = this.preview;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
		canvas.width = Math.round(PREVIEW_WIDTH * dpr);
		canvas.height = Math.round(PREVIEW_HEIGHT * dpr);
		canvas.setCssStyles({ width: `${PREVIEW_WIDTH}px` });
		canvas.setCssStyles({ height: `${PREVIEW_HEIGHT}px` });
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

		const stroke = this.previewStroke();
		renderStroke(ctx, stroke, PREVIEW_WIDTH, PREVIEW_HEIGHT);
	}

	private previewStroke(): Stroke {
		const points: number[] = [];
		const steps = 42;
		for (let i = 0; i <= steps; i++) {
			const t = i / steps;
			// A flattened S-curve reads as handwriting better than a sine wave.
			const x = 0.05 + 0.9 * t;
			const y = 0.5 - 0.28 * Math.sin((t - 0.5) * Math.PI * 1.8);
			const pressure = 0.3 + 0.7 * Math.sin(Math.PI * t) ** 0.6;
			points.push(x, y, pressure);
		}
		if (this.kind === "eraser") {
			const width = this.plugin.settings.eraserWidth;
			return {
				id: "preview",
				kind: "pen",
				page: 1,
				color: "#868e96",
				width: width / PREVIEW_WIDTH,
				opacity: 1,
				points,
			};
		}
		const kind = this.kind === "highlighter" ? "highlighter" : "pen";
		const brush = this.plugin.brushFor(kind);
		return {
			id: "preview",
			kind,
			page: 1,
			color: brush.color,
			width: brush.widthPx / PREVIEW_WIDTH,
			opacity: brush.opacity,
			points,
		};
	}
}
