import { setIcon, setTooltip } from "obsidian";

import type { PdfInkController } from "../controller";
import { t } from "../i18n";

/**
 * The pencil button in the PDF view's own header bar.
 *
 * The floating toolbar can be dismissed, and a PDF tab whose viewer never showed
 * up has no toolbar at all — but the header is the one place that is guaranteed
 * on every PDF tab, so this is where the per-tab switch lives.
 *
 * One switch, one meaning: lit means "this tab is an annotation surface" (the
 * toolbar is up and ink can be written), dark means "plain PDF reader" — the ink
 * that is already there stays visible, but nothing can be drawn, moved or erased.
 */
export class PdfInkHeaderControl {
	private button: HTMLButtonElement | null = null;
	private host: HTMLElement | null = null;
	private iconDrawn = false;
	/** Mount attempts inside the current window; see the circuit breaker below. */
	private mounts = 0;
	private mountWindowStart = 0;

	constructor(private readonly controller: PdfInkController) {}

	/** True when the button is in the header (attached tabs and restored ones). */
	get isMounted(): boolean {
		return Boolean(this.button);
	}

	/** Mounts the button into this leaf's header, or refreshes it in place. */
	ensure(): void {
		const actions = this.actionsEl();
		if (!actions) {
			// The header is not there yet (or the user hid it). Keep quiet: the
			// caller retries, and mounting into nothing would be pointless.
			return;
		}
		// `actions.contains` rather than `isConnected`: a tab restored in the
		// background has a perfectly good header that is simply not in the
		// document yet, and re-mounting on every check would shred it.
		if (this.button && this.host === actions && actions.contains(this.button)) {
			this.update();
			return;
		}
		// Circuit breaker. If something keeps removing the button (Obsidian
		// rebuilding the header in a loop), re-inserting it forever would drag the
		// whole app down with it — a missing button is the lesser harm.
		const now = Date.now();
		if (now - this.mountWindowStart > 2000) {
			this.mountWindowStart = now;
			this.mounts = 0;
		}
		if (this.mounts >= 8) {
			this.controller.plugin.log(`header button: gave up after ${this.mounts} mounts`);
			return;
		}
		this.mounts++;
		this.destroy();
		const doc = actions.ownerDocument;
		const button = doc.createElement("button");
		button.type = "button";
		button.className = "clickable-icon pdf-ink-header-btn";
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.controller.toggleAnnotations();
		});
		button.addEventListener("pointerdown", (event) => event.stopPropagation());
		actions.insertBefore(button, actions.firstChild);
		this.button = button;
		this.host = actions;
		this.iconDrawn = false;
		this.update();
	}

	private actionsEl(): HTMLElement | null {
		const container = this.controller.containerEl;
		const leafContent = container?.closest?.(".workspace-leaf-content");
		return leafContent?.querySelector?.(".view-header .view-actions") ?? null;
	}

	/** Mirrors the state on the button: the label says what a click would do. */
	update(): void {
		const button = this.button;
		if (!button) return;
		const on = this.controller.annotationsOn;
		// `setIcon` rewrites the element's contents, and the plugin observes the
		// header for changes — rewriting it on every update would feed that
		// observer forever and lock the app up. Draw it once.
		if (!this.iconDrawn) {
			setIcon(button, "pencil");
			this.iconDrawn = true;
		}
		const label = on ? t("批注：开（点击变成普通阅读）") : t("批注：关（点击开始批注）");
		if (button.getAttribute("aria-label") !== label) {
			// Attribute writes are not observed, so updating the label is free.
			button.setAttribute("aria-label", label);
			setTooltip(button, label);
		}
		button.classList.toggle("is-active", on);
		button.setAttribute("aria-pressed", on ? "true" : "false");
	}

	destroy(): void {
		this.button?.remove();
		this.button = null;
		this.host = null;
		this.iconDrawn = false;
	}
}
