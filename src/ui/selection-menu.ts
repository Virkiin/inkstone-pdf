import { setIcon } from "obsidian";
import type { PdfInkController } from "../controller";
import type { Box } from "./place";
import { clamp } from "../util";

/**
 * Small floating menu shown after tapping or long-pressing a stroke with the
 * pen. Keeps copy / cut / paste reachable without a mouse.
 */
export class SelectionMenu {
	private el: HTMLElement | null = null;
	private readonly doc: Document;
	private readonly onOutside = (event: PointerEvent): void => {
		const target = event.target as Node | null;
		if (this.el && target && this.el.contains(target)) return;
		if (this.anchor && target && this.anchor.contains(target)) return;
		this.close();
	};
	private readonly onKey = (event: KeyboardEvent): void => {
		if (event.key === "Escape") this.close();
	};
	private anchor: HTMLElement | null = null;

	constructor(private readonly controller: PdfInkController) {
		this.doc = controller.containerEl.ownerDocument;
	}

	get isOpen(): boolean {
		return Boolean(this.el);
	}

	open(
		clientX: number,
		clientY: number,
		anchor?: HTMLElement,
		placement?: { frame: Box; knob: Box },
	): void {
		this.close();
		const el = this.doc.createElement("div");
		el.className = "pdf-ink-selection-menu";
		this.anchor = anchor ?? null;

		const items: Array<[string, string, () => void]> = [
			["copy", "复制", () => this.controller.copySelection()],
			["scissors", "剪切", () => this.controller.cutSelection()],
			["clipboard-paste", "粘贴", () => this.controller.pasteClipboard()],
			["trash-2", "删除", () => this.controller.deleteSelection()],
		];
		for (const [icon, label, action] of items) {
			const row = this.doc.createElement("button");
			row.type = "button";
			row.className = "pdf-ink-selection-item";
			const iconEl = this.doc.createElement("span");
			iconEl.className = "pdf-ink-selection-icon";
			setIcon(iconEl, icon);
			const text = this.doc.createElement("span");
			text.textContent = label;
			row.append(iconEl, text);
			row.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				if (row.disabled) return;
				action();
				this.close();
			});
			const needsSelection = icon !== "clipboard-paste";
			if (needsSelection && !this.controller.hasSelection) {
				row.disabled = true;
				row.title = "先选中一条笔迹";
			}
			if (icon === "clipboard-paste" && !this.controller.hasClipboard) {
				row.disabled = true;
				row.title = "剪贴板是空的：先复制或剪切笔迹";
			}
			el.appendChild(row);
		}

		this.doc.body.appendChild(el);
		const rect = el.getBoundingClientRect();
		let left = clientX + 8;
		let top = clientY + 8;
		if (placement) {
			// Sit just outside the frame; never over the rotate knob, and try to
			// stay clear of the dashed frame itself.
			const gap = 10;
			const frame = placement.frame;
			const midX = (frame.left + frame.right) / 2;
			const midY = (frame.top + frame.bottom) / 2;
			const margin = 8;
			const clampX = (value: number): number =>
				clamp(value, margin, Math.max(margin, window.innerWidth - rect.width - margin));
			const clampY = (value: number): number =>
				clamp(value, margin, Math.max(margin, window.innerHeight - rect.height - margin));
			const candidates = [
				{ left: frame.right + gap, top: clampY(midY - rect.height / 2) },
				{ left: frame.left - gap - rect.width, top: clampY(midY - rect.height / 2) },
				{ left: clampX(midX - rect.width / 2), top: frame.bottom + gap },
				{
					left: clampX(midX - rect.width / 2),
					top: frame.top - gap - rect.height,
				},
			];
			let best = { left: clampX(clientX + 8), top: clampY(clientY + 8) };
			let bestScore = Number.NEGATIVE_INFINITY;
			for (const candidate of candidates) {
				const x = clampX(candidate.left);
				const y = clampY(candidate.top);
				const box = {
					left: x,
					top: y,
					right: x + rect.width,
					bottom: y + rect.height,
				};
				const knobOverlap = overlap(box, placement.knob);
				const frameOverlap = overlap(box, frame);
				const shifted =
					Math.abs(x - candidate.left) + Math.abs(y - candidate.top);
				const score = -knobOverlap * 20 - frameOverlap - shifted;
				if (score > bestScore) {
					bestScore = score;
					best = { left: x, top: y };
				}
			}
			left = best.left;
			top = best.top;
		}
		left = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8));
		top = Math.max(8, Math.min(top, window.innerHeight - rect.height - 8));
		el.setCssStyles({ left: `${left}px` });
		el.setCssStyles({ top: `${top}px` });
		this.el = el;

		window.setTimeout(() => {
			this.doc.addEventListener("pointerdown", this.onOutside, true);
			this.doc.addEventListener("keydown", this.onKey, true);
		}, 0);
	}

	close(): void {
		if (!this.el) return;
		this.doc.removeEventListener("pointerdown", this.onOutside, true);
		this.doc.removeEventListener("keydown", this.onKey, true);
		this.el.remove();
		this.el = null;
		this.anchor = null;
	}
}

function overlap(a: Box, b: Box): number {
	const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
	const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
	return width > 0 && height > 0 ? width * height : 0;
}
