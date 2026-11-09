import test from "node:test";
import assert from "node:assert/strict";
import { History } from "../src/history";

function entry(label: string, log: string[]) {
	return {
		label,
		undo: () => log.push(`undo:${label}`),
		redo: () => log.push(`redo:${label}`),
	};
}

test("undo and redo walk the stack", () => {
	const log: string[] = [];
	const history = new History();
	history.push(entry("a", log));
	history.push(entry("b", log));
	assert.equal(history.undoLabel, "b");
	assert.equal(history.undo(), true);
	assert.equal(history.redo(), true);
	assert.deepEqual(log, ["undo:b", "redo:b"]);
	assert.equal(history.canRedo, false);
});

test("pushing after undo clears the redo stack", () => {
	const log: string[] = [];
	const history = new History();
	history.push(entry("a", log));
	history.undo();
	history.push(entry("b", log));
	assert.equal(history.canRedo, false);
	assert.equal(history.redo(), false);
});

test("history honours its limit", () => {
	const log: string[] = [];
	const history = new History(2);
	history.push(entry("a", log));
	history.push(entry("b", log));
	history.push(entry("c", log));
	history.undo();
	history.undo();
	assert.equal(history.canUndo, false);
	assert.deepEqual(log, ["undo:c", "undo:b"]);
});

test("empty history is a no-op", () => {
	const history = new History();
	assert.equal(history.canUndo, false);
	assert.equal(history.undo(), false);
	assert.equal(history.redo(), false);
});
