import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
	missingTranslations,
	resolveUiLanguage,
	setUiLanguage,
	t,
	uiLanguage,
} from "../src/i18n";

declare const __dirname: string;

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

test("explicit settings win over the host language", () => {
	assert.equal(resolveUiLanguage("zh", "en-US"), "zh");
	assert.equal(resolveUiLanguage("en", "zh-CN"), "en");
});

test("auto follows Obsidian, including regional variants", () => {
	assert.equal(resolveUiLanguage("auto", "zh"), "zh");
	assert.equal(resolveUiLanguage("auto", "zh-cn"), "zh");
	assert.equal(resolveUiLanguage("auto", "zh-TW"), "zh");
	assert.equal(resolveUiLanguage("auto", "en"), "en");
	assert.equal(resolveUiLanguage("auto", "de"), "en");
	// Unknown host language (headless tests, stripped builds) falls back to English.
	assert.equal(resolveUiLanguage("auto", undefined), "en");
});

test("setUiLanguage reports whether the resolved language changed", () => {
	setUiLanguage("zh");
	assert.equal(uiLanguage(), "zh");
	assert.equal(setUiLanguage("zh"), false, "same language must not trigger a refresh");
	assert.equal(setUiLanguage("en"), true);
	assert.equal(uiLanguage(), "en");
	// "auto" only counts as a change when the host language resolves elsewhere.
	assert.equal(setUiLanguage("auto", "en-US"), false);
	assert.equal(setUiLanguage("auto", "zh-CN"), true);
	assert.equal(uiLanguage(), "zh");
});

/* -------------------------------------------------------------------------- */
/* Translation                                                                */
/* -------------------------------------------------------------------------- */

test("translated strings switch language, unknown ones fall back to Chinese", () => {
	setUiLanguage("zh");
	assert.equal(t("钢笔"), "钢笔");
	setUiLanguage("en");
	assert.equal(t("钢笔"), "Pen");
	// Not in the table yet: the Chinese original is still readable, never a key.
	assert.equal(t("这句还没有英文"), "这句还没有英文");
	setUiLanguage("zh");
});

test("placeholders are filled, and unknown ones are left alone", () => {
	setUiLanguage("en");
	assert.equal(t("图层：{name}", { name: "Answers" }), "Layer: Answers");
	assert.equal(t("图层：{name}", { other: 1 }), t("图层：{name}"));
	setUiLanguage("zh");
	assert.equal(t("图层：{name}", { name: "答案" }), "图层：答案");
});

/* -------------------------------------------------------------------------- */
/* Coverage: no migrated string may silently stay Chinese                     */
/* -------------------------------------------------------------------------- */

const SRC = path.resolve(__dirname, "../../src");

/**
 * Files that are fully migrated. Everything in them must have an English entry,
 * so adding a label here without a translation fails the test instead of
 * shipping a half-translated panel.
 */
const FULLY_MIGRATED = [
	"brush.ts",
	"controller.ts",
	"doc.ts",
	"keys.ts",
	"main.ts",
	"settings.ts",
	"ui/brush-panel.ts",
	"ui/confirm.ts",
	"ui/layers-content.ts",
	"ui/layers-view.ts",
	"ui/selection-menu.ts",
	"ui/toolbar.ts",
];

/**
 * Strings that stay in their own language on purpose: the language picker shows
 * "中文" and "English" as autonyms in every UI language, and the annotation
 * folder default is a path on disk, not a label.
 */
const INTENTIONAL = new Set(["中文", "附件/Ink 标注"]);

/** Strips comments so Chinese in a comment is not mistaken for UI text. */
function stripComments(text: string): string {
	return text
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

function chineseLiterals(text: string): string[] {
	const found: string[] = [];
	const pattern = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(stripComments(text))) !== null) {
		// Template literals that interpolate are translated as `{placeholder}`
		// keys by hand, so their raw source cannot be compared with the table.
		if (match[2].includes("${")) continue;
		if (/[\u4e00-\u9fff]/.test(match[2])) found.push(match[2]);
	}
	return found;
}

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (entry.name.endsWith(".ts")) out.push(full);
	}
	return out;
}

test("every string in a fully migrated file has an English entry", () => {
	const report: string[] = [];
	for (const file of walk(SRC)) {
		const relative = path.relative(SRC, file).replace(/\\/g, "/");
		const literals = chineseLiterals(fs.readFileSync(file, "utf8"));
		const unique = [...new Set(literals)].filter((literal) => !INTENTIONAL.has(literal));
		const missing = missingTranslations(unique);
		const covered = unique.length - missing.length;
		report.push(
			`${relative.padEnd(28)} ${String(covered).padStart(3)}/${String(unique.length).padEnd(3)}`,
		);
		if (FULLY_MIGRATED.includes(relative) && missing.length > 0) {
			assert.deepEqual(missing, [], `${relative} is migrated but has untranslated strings`);
		}
	}
	// Kept as output (not an assertion) so the progress of the migration is visible.
	process.stdout.write(`\ncoverage (translated/total Chinese literals per file):\n${report.join("\n")}\n\n`);
});

/* -------------------------------------------------------------------------- */
/* Wiring: a translated string must actually go through t()                   */
/* -------------------------------------------------------------------------- */

/**
 * Files whose Chinese strings are lookup keys rather than rendered text: the
 * action table and the eraser labels are translated where they are rendered.
 */
const TABLES_ONLY = ["keys.ts", "brush.ts", "toolbar.ts"];

/**
 * Chinese strings that are stored as *sources* and translated where they are
 * rendered (the brush panel's title table). Wrapping them at declaration time
 * would freeze the language at import.
 */
const RAW_SOURCES = new Set(["钢笔", "荧光笔", "橡皮"]);

/** Returns the Chinese literals that are not wrapped in `t(...)`. */
function unwrappedLiterals(text: string): string[] {
	const bad: string[] = [];
	let i = 0;
	const n = text.length;
	while (i < n) {
		const c = text[i];
		if (c === "/" && text[i + 1] === "/") {
			while (i < n && text[i] !== "\n") i++;
			continue;
		}
		if (c === "/" && text[i + 1] === "*") {
			const end = text.indexOf("*/", i + 2);
			i = end < 0 ? n : end + 2;
			continue;
		}
		if (c !== '"' && c !== "'" && c !== "`") {
			i++;
			continue;
		}
		const quote = c;
		let j = i + 1;
		let content = "";
		while (j < n) {
			const ch = text[j];
			if (ch === "\\") {
				content += text.slice(j, j + 2);
				j += 2;
				continue;
			}
			if (ch === quote) break;
			if (quote !== "`" && ch === "\n") break;
			content += ch;
			j++;
		}
		// `t(...)` wraps it directly; `registerCommand("源串", …)` translates the
		// source internally and keeps it for the next language switch.
		const wrapped = /(^|[^A-Za-z0-9_$])(t|registerCommand)\($/.test(text.slice(0, i).trimEnd());
		if (
			/[\u4e00-\u9fff]/.test(content) &&
			!INTENTIONAL.has(content) &&
			!RAW_SOURCES.has(content) &&
			!wrapped
		) {
			bad.push(content);
		}
		i = j + 1;
	}
	return bad;
}

test("no UI string is left unwrapped", () => {
	const offenders: string[] = [];
	for (const file of walk(SRC)) {
		const name = path.basename(file);
		if (TABLES_ONLY.includes(name) || name === "lang-en.ts") continue;
		for (const literal of unwrappedLiterals(fs.readFileSync(file, "utf8"))) {
			offenders.push(`${path.relative(SRC, file)}: ${literal}`);
		}
	}
	assert.deepEqual(offenders, [], "wrap these in t() so they follow the UI language");
});
