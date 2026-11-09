import { ItemView } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type PdfInkPlugin from "../main";
import { renderLayersInto } from "./layers-content";

export const VIEW_TYPE_LAYERS = "pdf-ink-layers";

/**
 * Sidebar variant of the layers list. The toolbar button opens the floating
 * popover instead; this view stays for people who prefer a docked panel.
 */
export class InkLayersView extends ItemView {
	private readonly plugin: PdfInkPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: PdfInkPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_LAYERS;
	}

	getDisplayText(): string {
		return "PDF 墨迹图层";
	}

	getIcon(): string {
		return "layers";
	}

	async onOpen(): Promise<void> {
		this.contentEl.classList.add("pdf-ink-layers");
		this.registerEvent(
			this.plugin.emitter.on("pdf-ink:doc-changed", () => this.scheduleRender()),
		);
		this.registerEvent(
			this.plugin.emitter.on("pdf-ink:active-changed", () => this.scheduleRender()),
		);
		this.render();
	}

	private renderScheduled = false;

	private scheduleRender(): void {
		if (this.renderScheduled) return;
		this.renderScheduled = true;
		window.requestAnimationFrame(() => {
			this.renderScheduled = false;
			this.render();
		});
	}

	render(): void {
		renderLayersInto(this.contentEl, this.plugin);
	}
}
