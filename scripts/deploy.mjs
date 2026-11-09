import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vault = path.resolve(root, "..");
const pluginsDir = path.join(vault, ".obsidian", "plugins");
const pluginId = "inkstone-pdf";
const target = path.join(pluginsDir, pluginId);
const legacy = path.join(pluginsDir, "pdf-ink");
const files = ["main.js", "manifest.json", "styles.css"];

for (const file of files) {
	if (!existsSync(path.join(root, file))) {
		console.error(`缺少构建产物 ${file}，请先构建（见 README）`);
		process.exit(1);
	}
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(root, "backups", stamp);
if (existsSync(path.join(target, "main.js")) || existsSync(path.join(legacy, "main.js"))) {
	mkdirSync(backupDir, { recursive: true });
	for (const dir of [target, legacy]) {
		for (const file of [...files, "data.json"]) {
			const from = path.join(dir, file);
			if (existsSync(from)) {
				copyFileSync(from, path.join(backupDir, `${path.basename(dir)}-${file}`));
			}
		}
	}
	console.log(`已备份当前线上版本 -> ${path.relative(root, backupDir)}`);
}

if (!existsSync(target)) mkdirSync(target, { recursive: true });

for (const file of files) {
	copyFileSync(path.join(root, file), path.join(target, file));
}

// 旧目录（id 改了之后的 `pdf-ink`）不再被 Obsidian 加载；把用户设置带过去再删掉，
// 否则笔刷预设、键位映射、快捷键全都会看起来"丢了"。
if (existsSync(legacy) && legacy !== target) {
	const legacyData = path.join(legacy, "data.json");
	const newData = path.join(target, "data.json");
	if (existsSync(legacyData)) {
		if (!existsSync(newData)) {
			copyFileSync(legacyData, newData);
			console.log("已把旧插件目录的 data.json（设置）迁移到新目录");
		} else {
			// 保留旧设置里用户真正改过的字段，避免覆盖新目录里已有的数据。
			try {
				const oldSettings = JSON.parse(readFileSync(legacyData, "utf8"));
				const current = JSON.parse(readFileSync(newData, "utf8"));
				const merged = { ...oldSettings, ...current };
				writeFileSync(newData, JSON.stringify(merged, null, 2), "utf8");
				console.log("已把旧 data.json 与新 data.json 合并");
			} catch (error) {
				console.warn(`合并 data.json 失败，保留新目录版本：${String(error)}`);
			}
		}
	}
	// 旧目录已备份，删除它，避免 Obsidian 里出现两个同名插件。
	rmSync(legacy, { recursive: true, force: true });
	console.log("已移除旧插件目录 .obsidian/plugins/pdf-ink（备份在 backups/）");
}

console.log(`已部署到 ${target}`);
console.log("在 Obsidian 中按 Ctrl+R 重新加载，或 设置 → 第三方插件 中重新启用。");
