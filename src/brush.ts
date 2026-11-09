import type { EraserRegion, EraserScope } from "./types";

/**
 * A full brush state: color + width + opacity. Clicking a preset applies all
 * three at once, which is the whole point of having presets instead of a
 * separate pen box.
 */
export interface BrushPreset {
	id: string;
	name: string;
	color: string;
	widthPx: number;
	opacity: number;
}

/** A saved eraser configuration (region × scope × radius). */
export interface EraserPreset {
	id: string;
	name: string;
	region: EraserRegion;
	scope: EraserScope;
	widthPx: number;
}

export type BrushKind = "pen" | "highlighter";
export type PresetKind = BrushKind | "eraser";

export const REGION_LABELS: Record<EraserRegion, string> = {
	free: "涂抹",
	rect: "矩形",
	lasso: "套索",
};

export const SCOPE_LABELS: Record<EraserScope, string> = {
	partial: "只擦选中",
	whole: "整笔删除",
};

/** Reference colors used only to give presets a human readable name. */
const NAMED_COLORS: Array<[string, string]> = [
	["#000000", "黑"],
	["#1e1e1e", "黑"],
	["#434343", "深灰"],
	["#868e96", "灰"],
	["#e03131", "红"],
	["#9c2b2b", "深红"],
	["#e64980", "粉"],
	["#f08c00", "橙"],
	["#ffd43b", "黄"],
	["#cdaa2d", "芥末"],
	["#2f9e44", "绿"],
	["#5f961d", "橄榄"],
	["#15aabf", "青"],
	["#1971c2", "蓝"],
	["#1c3f94", "深蓝"],
	["#7048e8", "紫"],
	["#8b5a2b", "棕"],
];

function hexToRgb(hex: string): [number, number, number] | null {
	const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
	if (!match) return null;
	let body = match[1];
	if (body.length === 3) {
		body = body
			.split("")
			.map((char) => char + char)
			.join("");
	}
	return [
		parseInt(body.slice(0, 2), 16),
		parseInt(body.slice(2, 4), 16),
		parseInt(body.slice(4, 6), 16),
	];
}

/** Nearest human name for a hex color ("红", "深蓝", ...); falls back to the hex. */
export function colorName(hex: string): string {
	const rgb = hexToRgb(hex);
	if (!rgb) return hex;
	let best = hex;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const [value, label] of NAMED_COLORS) {
		const target = hexToRgb(value);
		if (!target) continue;
		const distance =
			(rgb[0] - target[0]) ** 2 + (rgb[1] - target[1]) ** 2 + (rgb[2] - target[2]) ** 2;
		if (distance < bestDistance) {
			bestDistance = distance;
			best = label;
		}
	}
	return best;
}

/** "2.5" / "12" — one decimal at most, no trailing zero. */
export function formatWidth(widthPx: number): string {
	const rounded = Math.round(widthPx * 10) / 10;
	return String(rounded);
}

/** Auto name for a new pen / highlighter preset, e.g. "红 · 2.5". */
export function autoPresetName(color: string, widthPx: number): string {
	return `${colorName(color)} · ${formatWidth(widthPx)}`;
}

/** Auto name for a new eraser preset, e.g. "矩形 · 16". */
export function eraserPresetName(
	region: EraserRegion,
	widthPx: number,
): string {
	return `${REGION_LABELS[region]} · ${formatWidth(widthPx)}`;
}

/** Copies a preset list so defaults can never be mutated by accident. */
export function clonePresets<T extends { id: string }>(list: T[] | undefined): T[] {
	if (!Array.isArray(list)) return [];
	return list
		.filter((entry) => entry && typeof entry === "object")
		.map((entry) => ({ ...entry }));
}
