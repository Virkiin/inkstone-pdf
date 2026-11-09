export interface HistoryEntry {
	label: string;
	undo(): void;
	redo(): void;
}

/** Small command based undo/redo stack. */
export class History {
	private past: HistoryEntry[] = [];
	private future: HistoryEntry[] = [];
	private readonly limit: number;

	constructor(limit = 200) {
		this.limit = limit;
	}

	get canUndo(): boolean {
		return this.past.length > 0;
	}

	get canRedo(): boolean {
		return this.future.length > 0;
	}

	get undoLabel(): string {
		return this.past[this.past.length - 1]?.label ?? "";
	}

	get redoLabel(): string {
		return this.future[this.future.length - 1]?.label ?? "";
	}

	push(entry: HistoryEntry): void {
		this.past.push(entry);
		if (this.past.length > this.limit) this.past.shift();
		this.future.length = 0;
	}

	undo(): boolean {
		const entry = this.past.pop();
		if (!entry) return false;
		entry.undo();
		this.future.push(entry);
		return true;
	}

	redo(): boolean {
		const entry = this.future.pop();
		if (!entry) return false;
		entry.redo();
		this.past.push(entry);
		return true;
	}

	clear(): void {
		this.past.length = 0;
		this.future.length = 0;
	}
}
