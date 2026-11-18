import { EN } from "./lang-en";

/**
 * UI language, Excalidraw-style: the Chinese source strings in the code are the
 * lookup keys, and `lang-en.ts` only lists the strings that have been
 * translated. A missing entry falls back to the Chinese original, so a
 * half-filled table shows Chinese instead of a blank label or a raw key.
 *
 * This module deliberately does not import `obsidian`: the host language is
 * passed in by the caller (`getLanguage()`), which keeps the module testable in
 * plain node.
 */

export type UiLanguage = "auto" | "zh" | "en";
type ResolvedLanguage = "zh" | "en";

let resolved: ResolvedLanguage = "zh";

/** Maps the setting (plus Obsidian's language, for `auto`) to a concrete one. */
export function resolveUiLanguage(
	setting: UiLanguage,
	systemLanguage?: string,
): ResolvedLanguage {
	if (setting === "zh" || setting === "en") return setting;
	const language = (systemLanguage ?? "").toLowerCase();
	// `zh`, `zh-cn`, `zh-tw` … all use the Chinese table; anything else is English.
	return language.startsWith("zh") ? "zh" : "en";
}

/**
 * Applies the setting. Returns true when the resolved language actually
 * changed, so the caller only pays for a UI refresh when it has to.
 */
export function setUiLanguage(setting: UiLanguage, systemLanguage?: string): boolean {
	const next = resolveUiLanguage(setting, systemLanguage);
	if (next === resolved) return false;
	resolved = next;
	return true;
}

export function uiLanguage(): ResolvedLanguage {
	return resolved;
}

/**
 * Translates a Chinese source string. `{name}` placeholders are filled from
 * `params`; an unknown placeholder is left as-is rather than blanked.
 */
export function t(source: string, params?: Record<string, string | number>): string {
	const text = resolved === "en" ? EN[source] ?? source : source;
	if (!params) return text;
	return text.replace(/\{(\w+)\}/g, (match, key: string) =>
		Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
	);
}

/** Source strings without a translation, for the coverage test. */
export function missingTranslations(sources: Iterable<string>): string[] {
	return [...sources].filter((source) => !Object.prototype.hasOwnProperty.call(EN, source));
}

/**
 * Translates a value that is *data* rather than a label (a preset name, for
 * instance) only when it is an untouched built-in name. Anything the user
 * renamed is returned unchanged, so a language switch never edits their data.
 */
export function translateBuiltin(value: string): string {
	if (!Object.prototype.hasOwnProperty.call(EN, value)) return value;
	return t(value);
}
