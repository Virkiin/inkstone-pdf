import test from "node:test";
import assert from "node:assert/strict";
import {
	ACTIONS,
	actionIdForSpec,
	defaultBindings,
	findConflicts,
	formatKeySpec,
	matchesSpec,
	normalizeSpec,
	resolveBindings,
	specFromEvent,
} from "../src/keys";

/** Minimal KeyboardEvent stand-in: only the fields the matcher reads. */
const key = (
	name: string,
	mods: Partial<{ ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }> = {},
): KeyboardEvent =>
	({
		key: name,
		ctrlKey: Boolean(mods.ctrl),
		shiftKey: Boolean(mods.shift),
		altKey: Boolean(mods.alt),
		metaKey: Boolean(mods.meta),
	}) as KeyboardEvent;

test("keys: defaults keep the old hand-feel", () => {
	const bindings = resolveBindings(undefined);
	assert.equal(bindings["tool:pen"], "p");
	assert.equal(bindings["tool:highlighter"], "h");
	assert.equal(bindings["tool:eraser"], "e");
	assert.equal(bindings["tool:hand"], "g");
	assert.equal(bindings["color:1"], "1");
	assert.equal(bindings["color:9"], "9");
	assert.deepEqual(bindings, defaultBindings());
});

test("keys: untouched actions follow later default changes", () => {
	// Only the override is stored, so an action nobody touched keeps tracking
	// the shipped default (that is the whole point of resolveBindings).
	const saved = { "tool:pen": "k" };
	const bindings = resolveBindings(saved);
	assert.equal(bindings["tool:pen"], "k");
	assert.equal(bindings["tool:eraser"], "e");
});

test("keys: explicit empty string means unbound", () => {
	const bindings = resolveBindings({ "tool:pen": "" });
	assert.equal(bindings["tool:pen"], "");
	assert.equal(actionIdForSpec("p", bindings), null, "p is no longer the pen");
	assert.equal(findConflicts(bindings)[""], undefined, "unbound is not a conflict");
});

test("keys: plain letters do not fire with modifiers held", () => {
	assert.equal(matchesSpec("p", key("p")), true);
	assert.equal(matchesSpec("p", key("P", { shift: true })), false);
	assert.equal(matchesSpec("p", key("p", { ctrl: true })), false);
});

test("keys: modifier combos", () => {
	assert.equal(matchesSpec("shift+p", key("P", { shift: true })), true);
	assert.equal(matchesSpec("ctrl+shift+z", key("Z", { ctrl: true, shift: true })), true);
	assert.equal(matchesSpec("ctrl+z", key("z", { ctrl: true })), true);
	// Cmd on macOS stands in for Ctrl, otherwise every binding breaks there.
	assert.equal(matchesSpec("ctrl+z", key("z", { meta: true })), true);
	assert.equal(matchesSpec("alt+f", key("f", { alt: true })), true);
});

test("keys: normalisation and display", () => {
	assert.equal(normalizeSpec("Shift+P"), "shift+p");
	assert.equal(normalizeSpec(" alt + ctrl + k "), "ctrl+alt+k");
	assert.equal(normalizeSpec(""), "");
	assert.equal(normalizeSpec("Shift"), "", "a bare modifier is not a binding");
	assert.equal(formatKeySpec("ctrl+shift+z"), "Ctrl+Shift+Z");
	assert.equal(formatKeySpec("1"), "1");
	assert.equal(formatKeySpec("escape"), "Esc");
	assert.equal(formatKeySpec("pagedown"), "PgDn");
});

test("keys: recorder output round-trips through the matcher", () => {
	for (const event of [
		key("p"),
		key("P", { shift: true }),
		key("1"),
		key("ArrowDown"),
		key(" ", {}),
	]) {
		const spec = specFromEvent(event);
		assert.ok(spec, `recorded ${event.key}`);
		assert.equal(matchesSpec(spec, event), true, `replayed ${spec}`);
		assert.equal(normalizeSpec(spec), spec);
	}
});

test("keys: modifier-only presses record nothing", () => {
	assert.equal(specFromEvent(key("Shift", { shift: true })), "");
	assert.equal(specFromEvent(key("Control", { ctrl: true })), "");
});

test("keys: dispatch picks the action, and rebinding moves it", () => {
	const defaults = resolveBindings(undefined);
	assert.equal(actionIdForSpec("p", defaults), "tool:pen");
	assert.equal(actionIdForSpec("1", defaults), "color:1");
	assert.equal(actionIdForSpec("q", defaults), null);

	const rebound = resolveBindings({ "tool:pen": "k" });
	assert.equal(actionIdForSpec("k", rebound), "tool:pen");
	assert.equal(actionIdForSpec("p", rebound), null);
});

test("keys: duplicate bindings are reported", () => {
	const bindings = resolveBindings({ "tool:pen": "q", "tool:eraser": "q" });
	const conflicts = findConflicts(bindings);
	assert.deepEqual(conflicts["q"].sort(), ["tool:eraser", "tool:pen"]);
	assert.equal(Object.keys(findConflicts(resolveBindings(undefined))).length, 0);
});

test("keys: action table stays consistent", () => {
	const ids = new Set<string>();
	const specs = new Map<string, string>();
	for (const action of ACTIONS) {
		assert.ok(action.id, "every action has an id");
		assert.equal(ids.has(action.id), false, `duplicate id ${action.id}`);
		ids.add(action.id);
		const spec = normalizeSpec(action.defaultSpec);
		assert.ok(spec, `${action.id} has a valid default`);
		assert.equal(specs.has(spec), false, `default ${spec} is unique`);
		specs.set(spec, action.id);
	}
});
