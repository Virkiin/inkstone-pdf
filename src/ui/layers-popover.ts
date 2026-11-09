import type PdfInkPlugin from "../main";
import { renderLayersInto } from "./layers-content";

/**
 * Floating layers panel anchored to the toolbar button.
 * Lives on <body> so neither the PDF container nor the window edge clips it.
 */
export class PdfInkLayersPopover {
	private panel: HTMLElement | null = null;
	private anchor: HTMLElement | null = null;
	private renderQueued = false;
	private readonly unsubscribers: Array<() => void> = [];
	private readonly onDocumentPointerDown = (event: PointerEvent): void => {
		if (!this.panel) return;
		const target = event.target as Node | null;
		if (!target) return;
		if (this.panel.contains(target) || this.anchor?.contains(target)) return;
		this.close();
	};
	private readonly onKeyDown = (event: KeyboardEvent): void => {
		if (event.key === "Escape") this.close();
	};

	constructor(private readonly plugin: PdfInkPlugin) {}

	get isOpen(): boolean {
		return Boolean(this.panel);
	}

	toggle(anchor: HTMLElement | null): void {
		if (this.panel) {
			this.close();
			return;
		}
		this.open(anchor);
	}

	open(anchor: HTMLElement | null): void {
		this.close();
		const doc = anchor?.ownerDocument ?? document;
		const panel = doc.createElement("div");
		panel.className = "pdf-ink-layers pdf-ink-layers-popover";
		doc.body.appendChild(panel);
		this.panel = panel;
		this.anchor = anchor;
		renderLayersInto(panel, this.plugin);
		this.position(panel, anchor, doc);
		doc.addEventListener("pointerdown", this.onDocumentPointerDown, true);
		doc.addEventListener("keydown", this.onKeyDown, true);
		const schedule = () => this.scheduleRender();
		for (const name of ["pdf-ink:doc-changed", "pdf-ink:active-changed"] as const) {
			const ref = this.plugin.emitter.on(name, schedule);
			this.unsubscribers.push(() => this.plugin.emitter.offref(ref));
		}
	}

	close(): void {
		if (!this.panel) return;
		const doc = this.panel.ownerDocument;
		doc.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
		doc.removeEventListener("keydown", this.onKeyDown, true);
		for (const off of this.unsubscribers.splice(0)) off();
		this.panel.remove();
		this.panel = null;
		this.anchor = null;
	}

	private scheduleRender(): void {
		if (this.renderQueued || !this.panel) return;
		this.renderQueued = true;
		window.requestAnimationFrame(() => {
			this.renderQueued = false;
			if (this.panel) renderLayersInto(this.panel, this.plugin);
		});
	}

	private position(panel: HTMLElement, anchor: HTMLElement | null, doc: Document): void {
		const rect = panel.getBoundingClientRect();
		const view = doc.defaultView ?? window;
		if (!anchor || !anchor.isConnected) {
			panel.style.left = `${Math.max(8, (view.innerWidth - rect.width) / 2)}px`;
			panel.style.top = `${Math.max(8, (view.innerHeight - rect.height) / 3)}px`;
			return;
		}
		const anchorRect = anchor.getBoundingClientRect();
		const toolbar = anchor.closest(".pdf-ink-toolbar") as HTMLElement | null;
		const toolbarRect = toolbar?.getBoundingClientRect() ?? null;
		const gap = 8;
		const candidates = [
			{ left: anchorRect.right + gap, top: anchorRect.top },
			{ left: anchorRect.left - gap - rect.width, top: anchorRect.top },
			{ left: anchorRect.left, top: anchorRect.bottom + gap },
			{ left: anchorRect.left, top: anchorRect.top - gap - rect.height },
		];
		let best = { left: 0, top: 0 };
		let bestScore = Number.NEGATIVE_INFINITY;
		for (const candidate of candidates) {
			const left = clamp(candidate.left, 8, Math.max(8, view.innerWidth - rect.width - 8));
			const top = clamp(candidate.top, 8, Math.max(8, view.innerHeight - rect.height - 8));
			const overlap = toolbarRect
				? overlapArea(
						{ left, top, width: rect.width, height: rect.height },
						toolbarRect,
					)
				: 0;
			const shifted = Math.abs(left - candidate.left) + Math.abs(top - candidate.top);
			const score = -overlap * 3 - shifted;
			if (score > bestScore) {
				bestScore = score;
				best = { left, top };
			}
		}
		panel.style.left = `${best.left}px`;
		panel.style.top = `${best.top}px`;
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function overlapArea(
	box: { left: number; top: number; width: number; height: number },
	other: { left: number; top: number; right: number; bottom: number },
): number {
	const right = box.left + box.width;
	const bottom = box.top + box.height;
	const w = Math.min(right, other.right) - Math.max(box.left, other.left);
	const h = Math.min(bottom, other.bottom) - Math.max(box.top, other.top);
	return w > 0 && h > 0 ? w * h : 0;
}
