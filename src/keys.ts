import type { ToolName } from "./types";

/**
 * Rebindable keyboard actions.
 *
 * Why a table of our own instead of "just register Obsidian commands":
 * Obsidian commands only ever deliver `keydown`, so a hold-to-do-something
 * gesture (the thing every pen tablet user expects from the pen side button)
 * is impossible through them. A plugin-owned table gives us `keydown` /
 * `keyup` symmetry, one source of truth, and a conflict check we control.
 *
 * The Obsidian commands stay available for the command palette.
 */
export interface PdfInkActionDef {
	/** stable id, also the key in `settings.keyBindings` */
	id: string;
	name: string;
	group: string;
	/** binding applied when the user never touched this action */
	defaultSpec: string;
	tool?: ToolName;
	/** palette index (0-based) for colour actions */
	colorIndex?: number;
}

export const ACTIONS: PdfInkActionDef[] = [
	{ id: "tool:pen", name: "钢笔", group: "工具", defaultSpec: "p", tool: "pen" },
	{ id: "tool:highlighter", name: "荧光笔", group: "工具", defaultSpec: "h", tool: "highlighter" },
	{ id: "tool:eraser", name: "橡皮", group: "工具", defaultSpec: "e", tool: "eraser" },
	{ id: "tool:select", name: "选择", group: "工具", defaultSpec: "s", tool: "select" },
	{ id: "tool:line", name: "直线", group: "工具", defaultSpec: "l", tool: "line" },
	{ id: "tool:arrow", name: "箭头", group: "工具", defaultSpec: "a", tool: "arrow" },
	{ id: "tool:rect", name: "矩形", group: "工具", defaultSpec: "r", tool: "rect" },
	{ id: "tool:ellipse", name: "椭圆", group: "工具", defaultSpec: "o", tool: "ellipse" },
	{ id: "tool:hand", name: "拖拽页面", group: "工具", defaultSpec: "g", tool: "hand" },
	{ id: "color:1", name: "调色板第 1 色", group: "颜色", defaultSpec: "1", colorIndex: 0 },
	{ id: "color:2", name: "调色板第 2 色", group: "颜色", defaultSpec: "2", colorIndex: 1 },
	{ id: "color:3", name: "调色板第 3 色", group: "颜色", defaultSpec: "3", colorIndex: 2 },
	{ id: "color:4", name: "调色板第 4 色", group: "颜色", defaultSpec: "4", colorIndex: 3 },
	{ id: "color:5", name: "调色板第 5 色", group: "颜色", defaultSpec: "5", colorIndex: 4 },
	{ id: "color:6", name: "调色板第 6 色", group: "颜色", defaultSpec: "6", colorIndex: 5 },
	{ id: "color:7", name: "调色板第 7 色", group: "颜色", defaultSpec: "7", colorIndex: 6 },
	{ id: "color:8", name: "调色板第 8 色", group: "颜色", defaultSpec: "8", colorIndex: 7 },
	{ id: "color:9", name: "调色板第 9 色", group: "颜色", defaultSpec: "9", colorIndex: 8 },
];

export type KeyMod = "ctrl" | "alt" | "shift";

export interface ParsedKeySpec {
	mods: KeyMod[];
	key: string;
}

const MOD_ALIASES: Record<string, KeyMod> = {
	ctrl: "ctrl",
	control: "ctrl",
	mod: "ctrl",
	cmd: "ctrl",
	command: "ctrl",
	meta: "ctrl",
	alt: "alt",
	option: "alt",
	opt: "alt",
	shift: "shift",
};

const PRETTY_KEYS: Record<string, string> = {
	space: "Space",
	escape: "Esc",
	enter: "Enter",
	tab: "Tab",
	arrowup: "↑",
	arrowdown: "↓",
	arrowleft: "←",
	arrowright: "→",
	pageup: "PgUp",
	pagedown: "PgDn",
	home: "Home",
	end: "End",
	backspace: "Backspace",
	delete: "Delete",
	bracketleft: "[",
	bracketright: "]",
	comma: ",",
	period: ".",
	slash: "/",
	semicolon: ";",
	quote: "'",
	backslash: "\\",
	minus: "-",
	equal: "=",
	backquote: "`",
};

/** Lower-cases printable keys, keeps named keys comparable across events. */
export function normalizeKeyName(key: string): string {
	if (!key) return "";
	if (key === "Control" || key === "Shift" || key === "Alt" || key === "Meta") {
		return "";
	}
	if (key === " ") return "space";
	return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
}

export function parseKeySpec(spec: string): ParsedKeySpec | null {
	const raw = spec.trim();
	if (!raw) return null;
	const tokens = raw
		.toLowerCase()
		.split("+")
		.map((token) => token.trim())
		.filter(Boolean);
	if (tokens.length === 0) return null;
	const key = tokens.pop();
	if (!key) return null;
	// A binding has to end in a real key: "ctrl" alone is not one.
	if (MOD_ALIASES[key]) return null;
	const mods: KeyMod[] = [];
	for (const token of tokens) {
		const mod = MOD_ALIASES[token];
		if (mod && !mods.includes(mod)) mods.push(mod);
	}
	return { mods, key };
}

/** Canonical form used for comparisons and storage: ctrl+alt+shift+key. */
export function normalizeSpec(spec: string): string {
	const parsed = parseKeySpec(spec);
	if (!parsed) return "";
	const parts: string[] = [];
	for (const mod of ["ctrl", "alt", "shift"] as KeyMod[]) {
		if (parsed.mods.includes(mod)) parts.push(mod);
	}
	parts.push(parsed.key);
	return parts.join("+");
}

export function formatKeySpec(spec: string): string {
	const parsed = parseKeySpec(spec);
	if (!parsed) return "";
	const parts: string[] = [];
	if (parsed.mods.includes("ctrl")) parts.push("Ctrl");
	if (parsed.mods.includes("alt")) parts.push("Alt");
	if (parsed.mods.includes("shift")) parts.push("Shift");
	const pretty = PRETTY_KEYS[parsed.key];
	if (pretty) parts.push(pretty);
	else if (parsed.key.length === 1) parts.push(parsed.key.toUpperCase());
	else parts.push(parsed.key.charAt(0).toUpperCase() + parsed.key.slice(1));
	return parts.join("+");
}

/** Binding written by the recorder: "shift+p", "ctrl+alt+k", "f". */
export function specFromEvent(event: KeyboardEvent): string {
	const parts: string[] = [];
	if (event.ctrlKey || event.metaKey) parts.push("ctrl");
	if (event.altKey) parts.push("alt");
	if (event.shiftKey) parts.push("shift");
	const key = normalizeKeyName(event.key);
	if (!key) return "";
	parts.push(key);
	return parts.join("+");
}

export function matchesSpec(spec: string, event: KeyboardEvent): boolean {
	const parsed = parseKeySpec(spec);
	if (!parsed) return false;
	const hasCtrl = event.ctrlKey || event.metaKey;
	if (parsed.mods.includes("ctrl") !== hasCtrl) return false;
	if (parsed.mods.includes("alt") !== event.altKey) return false;
	if (parsed.mods.includes("shift") !== event.shiftKey) return false;
	return normalizeKeyName(event.key) === parsed.key;
}

export function defaultBindings(): Record<string, string> {
	const out: Record<string, string> = {};
	for (const action of ACTIONS) out[action.id] = action.defaultSpec;
	return out;
}

/**
 * Saved bindings only store the actions the user changed (or cleared), so a
 * later change to a default reaches everyone who never touched that action.
 */
export function resolveBindings(saved: Record<string, string> | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	for (const action of ACTIONS) {
		if (saved && Object.prototype.hasOwnProperty.call(saved, action.id)) {
			out[action.id] = saved[action.id] ?? "";
		} else {
			out[action.id] = action.defaultSpec;
		}
	}
	return out;
}

export function actionIdForSpec(
	spec: string,
	bindings: Record<string, string>,
): string | null {
	const wanted = normalizeSpec(spec);
	if (!wanted) return null;
	for (const action of ACTIONS) {
		if (normalizeSpec(bindings[action.id] ?? "") === wanted) return action.id;
	}
	return null;
}

/** Specs bound to more than one action, for the settings page warning. */
export function findConflicts(bindings: Record<string, string>): Record<string, string[]> {
	const seen = new Map<string, string[]>();
	for (const action of ACTIONS) {
		const spec = normalizeSpec(bindings[action.id] ?? "");
		if (!spec) continue;
		const list = seen.get(spec);
		if (list) list.push(action.id);
		else seen.set(spec, [action.id]);
	}
	const conflicts: Record<string, string[]> = {};
	for (const [spec, ids] of seen) {
		if (ids.length > 1) conflicts[spec] = ids;
	}
	return conflicts;
}
