import test from "node:test";
import assert from "node:assert/strict";
import { InkStorage } from "../src/storage";
import { createDoc } from "../src/doc";

// The debounced writer uses `window.setTimeout` (Obsidian is a browser env).
(globalThis as any).window = { setTimeout, clearTimeout };

class FakeAdapter {
	files = new Map<string, string>();
	folders = new Set<string>();

	async exists(path: string): Promise<boolean> {
		return this.files.has(path) || this.folders.has(path);
	}

	async read(path: string): Promise<string> {
		const value = this.files.get(path);
		if (value === undefined) throw new Error(`ENOENT ${path}`);
		return value;
	}

	async write(path: string, data: string): Promise<void> {
		this.files.set(path, data);
	}

	async mkdir(path: string): Promise<void> {
		this.folders.add(path);
	}

	async rename(from: string, to: string): Promise<void> {
		const value = this.files.get(from);
		if (value === undefined) throw new Error(`ENOENT ${from}`);
		this.files.delete(from);
		this.files.set(to, value);
	}
}

function setup(folder = "附件/Ink 标注", isBusy?: () => boolean) {
	const adapter = new FakeAdapter();
	const app = { vault: { adapter } } as any;
	const storage = new InkStorage(app, () => folder, isBusy);
	return { adapter, storage };
}

test("sidecar path mirrors the PDF path", () => {
	const { storage } = setup();
	assert.equal(storage.folder, "附件/Ink 标注");
	assert.equal(
		storage.pathFor("资料/高数.pdf"),
		"附件/Ink 标注/资料/高数.pdf.json",
	);
});

test("load returns null when no annotations exist yet", async () => {
	const { storage } = setup();
	assert.equal(await storage.load("missing.pdf"), null);
});

test("save creates folders and round-trips strokes", async () => {
	const { adapter, storage } = setup();
	const doc = createDoc("资料/测试.pdf");
	doc.layers[0].strokes.push({
		id: "s1",
		kind: "pen",
		page: 1,
		color: "#e03131",
		width: 0.003,
		opacity: 1,
		points: [0.1, 0.1, 0.5, 0.2, 0.2, 0.5],
	});
	storage.scheduleSave("资料/测试.pdf", doc, 5);
	await new Promise((resolve) => setTimeout(resolve, 40));

	const path = storage.pathFor("资料/测试.pdf");
	assert.equal(adapter.folders.has("附件"), true);
	assert.equal(adapter.folders.has("附件/Ink 标注"), true);
	assert.equal(adapter.folders.has("附件/Ink 标注/资料"), true);
	assert.ok(adapter.files.has(path));

	const loaded = await storage.load("资料/测试.pdf");
	assert.ok(loaded);
	assert.equal(loaded!.layers[0].strokes.length, 1);
	assert.deepEqual(loaded!.layers[0].strokes[0].points, [0.1, 0.1, 0.5, 0.2, 0.2, 0.5]);
});

test("save compacts coordinates and eraser polylines", async () => {
	const { adapter, storage } = setup();
	const doc = createDoc("资料/紧凑.pdf");
	doc.layers[0].strokes.push({
		id: "s1",
		kind: "pen",
		page: 1,
		color: "#e03131",
		width: 0.003,
		opacity: 1,
		points: [0.123456789012, 0.987654321098, 0.5, 0.222222222222, 0.888888888888, 0.5],
	});
	// 1 px apart on an 816 px page → thinned down to the endpoints.
	const eraser: number[] = [];
	for (let i = 0; i < 40; i++) eraser.push(0.1 + i / 816, 0.1, 0.5);
	doc.layers[0].strokes.push({
		id: "s2",
		kind: "eraser",
		page: 1,
		color: "#000000",
		width: 0.02,
		opacity: 1,
		points: eraser,
	});
	await storage.writeNow("资料/紧凑.pdf", doc);
	const stored = JSON.parse(adapter.files.get(storage.pathFor("资料/紧凑.pdf"))!);

	assert.deepEqual(stored.layers[0].strokes[0].points, [0.1235, 0.9877, 0.5, 0.2222, 0.8889, 0.5]);
	const penPoints = stored.layers[0].strokes[1].points.length;
	assert.ok(penPoints < eraser.length, `expected thinning, got ${penPoints}`);
	assert.deepEqual(stored.layers[0].strokes[1].points.slice(0, 3), [0.1, 0.1, 0.5]);
	assert.deepEqual(stored.layers[0].strokes[1].points.slice(-3), [
		Number((0.1 + 39 / 816).toFixed(4)),
		0.1,
		0.5,
	]);
});

test("flush defers while a stroke is in progress", async () => {
	let busy = true;
	const { adapter, storage } = setup("附件/Ink 标注", () => busy);
	const doc = createDoc("a.pdf");
	storage.scheduleSave("a.pdf", doc, 5);
	await new Promise((resolve) => setTimeout(resolve, 30));
	assert.equal(adapter.files.size, 0);

	busy = false;
	await storage.flush("a.pdf");
	assert.ok(adapter.files.has(storage.pathFor("a.pdf")));
});

test("flushAll writes pending documents immediately", async () => {
	const { adapter, storage } = setup();
	const doc = createDoc("a.pdf");
	storage.scheduleSave("a.pdf", doc, 60_000);
	await storage.flushAll();
	assert.ok(adapter.files.has(storage.pathFor("a.pdf")));
});

test("move relocates the sidecar and updates its file field", async () => {
	const { adapter, storage } = setup();
	const doc = createDoc("old.pdf");
	await storage.writeNow("old.pdf", doc);
	await storage.move("old.pdf", "folder/new.pdf");

	const from = storage.pathFor("old.pdf");
	const to = storage.pathFor("folder/new.pdf");
	assert.equal(adapter.files.has(from), false);
	assert.ok(adapter.files.has(to));
	const moved = JSON.parse(adapter.files.get(to)!);
	assert.equal(moved.file, "folder/new.pdf");
});

test("move is a no-op when the source has no annotations", async () => {
	const { adapter, storage } = setup();
	await storage.move("nothing.pdf", "other.pdf");
	assert.equal(adapter.files.size, 0);
});
