import { Modal } from "obsidian";
import type { App } from "obsidian";

/**
 * Destructive-action confirmation. Obsidian has no built-in confirm dialog and
 * `window.confirm` is unreliable inside Electron, so this is a small modal.
 */
export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly title: string,
		private readonly message: string,
		private readonly confirmLabel: string,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.title);
		this.contentEl.createEl("p", { text: this.message });
		const row = this.contentEl.createDiv("pdf-ink-confirm-row");
		const cancel = row.createEl("button", { text: "取消" });
		const confirm = row.createEl("button", {
			text: this.confirmLabel,
			cls: "mod-warning",
		});
		cancel.addEventListener("click", () => this.close());
		confirm.addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
