import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tag = process.argv[2];
if (!tag) {
	console.error("用法: node scripts/restore.mjs <git-tag>");
	console.error("查看可用版本: git tag --list");
	process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vault = path.resolve(root, "..");
const target = path.join(vault, ".obsidian", "plugins", "pdf-ink");
const files = ["main.js", "manifest.json", "styles.css"];

try {
	execFileSync("git", ["rev-parse", "--verify", `refs/tags/${tag}`], {
		cwd: root,
		stdio: "ignore",
	});
} catch {
	console.error(`找不到标签 ${tag}`);
	process.exit(1);
}

if (existsSync(path.join(target, "main.js"))) {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupDir = path.join(root, "backups", `before-restore-${stamp}`);
	mkdirSync(backupDir, { recursive: true });
	for (const file of files) {
		const from = path.join(target, file);
		if (existsSync(from)) copyFileSync(from, path.join(backupDir, file));
	}
	console.log(`已备份回滚前版本 -> ${path.relative(root, backupDir)}`);
}

for (const file of files) {
	const content = execFileSync("git", ["show", `${tag}:${file}`], { cwd: root });
	mkdirSync(target, { recursive: true });
	writeFileSync(path.join(target, file), content);
}

console.log(`已把 ${tag} 的 ${files.join(", ")} 还原到 ${target}`);
console.log("在 Obsidian 中按 Ctrl+R 重新加载插件。");
