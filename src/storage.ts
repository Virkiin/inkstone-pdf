import type { App } from "obsidian";
import { compactDocForSave, countPoints } from "./compact";
import { normalizeDoc } from "./doc";
import { normalizeVaultPath } from "./path";
import { perf } from "./perf";
import type { InkDoc } from "./types";

/**
 * Persists one JSON sidecar per annotated file inside the vault, e.g.
 * `附件/Ink 标注/资料/高数.pdf.json`. Keeping the data inside the vault means
 * Obsidian Sync / git / any other vault sync picks it up for free.
 */
const BUSY_RETRY_MS = 400;

export class InkStorage {
	private readonly timers = new Map<string, number>();
	private readonly pending = new Map<string, InkDoc>();

	constructor(
		private readonly app: App,
		private readonly getFolder: () => string,
		/** True while the user is mid-stroke; saves wait for idle. */
		private readonly isBusy?: () => boolean,
	) {}

	get folder(): string {
		const raw = (this.getFolder() ?? "").replace(/^\/+|\/+$/g, "");
		return normalizeVaultPath(raw.length > 0 ? raw : "PDF Ink");
	}

	pathFor(filePath: string): string {
		const folder = this.folder;
		return normalizeVaultPath(
			folder.length > 0 ? `${folder}/${filePath}.json` : `${filePath}.json`,
		);
	}

	private get adapter() {
		return this.app.vault.adapter;
	}

	async load(filePath: string): Promise<InkDoc | null> {
		const path = this.pathFor(filePath);
		try {
			if (!(await this.adapter.exists(path))) return null;
			const text = await this.adapter.read(path);
			return normalizeDoc(JSON.parse(text), filePath);
		} catch (error) {
			console.error(`[pdf-ink] failed to read ${path}`, error);
			return null;
		}
	}

	async writeNow(filePath: string, doc: InkDoc): Promise<void> {
		const path = this.pathFor(filePath);
		await this.ensureParentFolder(path);
		doc.file = filePath;
		doc.updated = Date.now();
		const doneSerialize = perf.start("save.serialize");
		let text = "";
		try {
			compactDocForSave(doc);
			text = JSON.stringify(doc);
		} finally {
			doneSerialize();
		}
		perf.count("save.bytes", text.length);
		perf.count("save.points", countPoints(doc));
		const doneWrite = perf.start("save.write");
		try {
			await this.adapter.write(path, text);
		} finally {
			doneWrite();
		}
	}

	scheduleSave(filePath: string, doc: InkDoc, delay = 500): void {
		this.pending.set(filePath, doc);
		const existing = this.timers.get(filePath);
		if (existing) window.clearTimeout(existing);
		this.timers.set(
			filePath,
			window.setTimeout(() => {
				this.timers.delete(filePath);
				void this.flush(filePath);
			}, delay),
		);
	}

	/** One-time copy before a destructive migration rewrites the sidecar. */
	async backupOnce(filePath: string): Promise<void> {
		const path = this.pathFor(filePath);
		const backup = `${path}.bak`;
		try {
			if (await this.adapter.exists(backup)) return;
			if (!(await this.adapter.exists(path))) return;
			await this.adapter.write(backup, await this.adapter.read(path));
			void backup;
		} catch (error) {
			console.error("[pdf-ink] failed to back up sidecar", error);
		}
	}

	async flush(filePath: string, force = false): Promise<void> {
		const doc = this.pending.get(filePath);
		if (!doc) return;
		// Writing 2 MB while the pen is still down shows up as a visible hitch,
		// so defer until the page is idle again.
		if (!force && this.isBusy?.()) {
			this.scheduleSave(filePath, doc, BUSY_RETRY_MS);
			return;
		}
		this.pending.delete(filePath);
		try {
			await this.writeNow(filePath, doc);
		} catch (error) {
			console.error(`[pdf-ink] failed to save annotations of ${filePath}`, error);
		}
	}

	async flushAll(): Promise<void> {
		const timers = [...this.timers.values()];
		for (const timer of timers) window.clearTimeout(timer);
		this.timers.clear();
		const paths = [...this.pending.keys()];
		await Promise.all(paths.map((path) => this.flush(path, true)));
	}

	/** Move the sidecar when the annotated PDF is renamed inside the vault. */
	async move(oldPath: string, newPath: string): Promise<void> {
		if (oldPath === newPath) return;
		const from = this.pathFor(oldPath);
		const to = this.pathFor(newPath);
		if (from === to) return;
		try {
			if (!(await this.adapter.exists(from))) return;
			await this.ensureParentFolder(to);
			if (await this.adapter.exists(to)) {
				console.error(`[pdf-ink] annotation file already exists: ${to}`);
				return;
			}
			await this.adapter.rename(from, to);
			const doc = await this.load(newPath);
			if (doc) {
				doc.file = newPath;
				await this.adapter.write(to, JSON.stringify(doc));
			}
			const pendingDoc = this.pending.get(oldPath);
			if (pendingDoc) {
				this.pending.delete(oldPath);
				pendingDoc.file = newPath;
				this.pending.set(newPath, pendingDoc);
			}
		} catch (error) {
			console.error(`[pdf-ink] failed to move ${from} -> ${to}`, error);
		}
	}

	private async ensureParentFolder(path: string): Promise<void> {
		const parts = path.split("/");
		parts.pop();
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!current) continue;
			if (!(await this.adapter.exists(current))) {
				try {
					await this.adapter.mkdir(current);
				} catch (error) {
					if (!(await this.adapter.exists(current))) throw error;
				}
			}
		}
	}
}
