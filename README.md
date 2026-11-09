# Inkstone PDF

English | [中文](#中文说明)

Handwrite, sketch and annotate directly on PDF pages **inside Obsidian** — with pressure, layers,
undo/redo, and annotations stored separately so your PDF is never modified.

> **Inkstone PDF** (id `inkstone-pdf`) · desktop only · Obsidian 1.8.0+

![The full Obsidian window: a PDF page with shapes, a selection box and the stroke menu](./docs/images/hero.png)

![The full window again: a rotated selection frame with the live scale read-out](./docs/images/selection-rotate.png)

![The floating toolbar: tools, quick colours, undo, layers](./docs/images/toolbar.png)

## Why another PDF annotator?

Most PDF readers only highlight; handwriting lives on a tablet; and then you export screenshots and
retype your notes. Inkstone PDF closes that seam: the PDF view inside Obsidian becomes a page you can
write on, and the ink lives in your vault next to your notes.

- **Pen down, ink down.** No mode switch. Pressure is per point.
- **Boolean eraser.** Erasing carves ink away instead of painting over it, so erased parts never
  come back when you move the stroke.
- **Real selection.** Free X/Y scaling, single-axis handles, rotation with 15° snapping, arrow-key
  nudging, copy / cut / paste.
- **Document layers.** Annotate on one layer, answers on another, hide one to test yourself.
- **Screenless tablet support.** Hold a key for a temporary eraser, hold Shift and drag to resize
  the brush, rebindable keyboard shortcuts for every tool.
- **Your PDF stays untouched.** Strokes are stored in a sidecar JSON inside your vault, so they sync
  with it and undo still works.

## Install

### From the community directory

Settings → Community plugins → Browse → search **Inkstone PDF** → Install → Enable.

### Manually

1. Download `main.js`, `manifest.json` and `styles.css` from the latest release.
2. Put them in `<your vault>/.obsidian/plugins/inkstone-pdf/`.
3. Restart Obsidian (or press `Ctrl/Cmd+R`), then enable **Inkstone PDF** in
   Settings → Community plugins.

## Usage (the short version)

| Action | How |
| --- | --- |
| Write | Pick the pen and write on any PDF page |
| Tools | `P` pen · `H` highlighter · `E` eraser · `S` select · `L` line · `A` arrow · `R` rect · `O` ellipse · `G` pan |
| Brush panel | Double-click (or right-click / long-press) a brush button |
| Temporary eraser | Hold `F`, release to get the previous pen back |
| Resize the brush | Hold `Shift` and drag the pen **on the page**: left/right = size, up/down = opacity |
| Select ink | Select tool, drag a box; then drag, scale, rotate, or nudge with arrow keys |
| Text selection | Select tool + `Alt` (gives the page back to the PDF text layer) |
| Undo / redo | `Ctrl/Cmd+Z` · `Ctrl/Cmd+Shift+Z` |

Every shortcut above is rebindable in **Settings → Inkstone PDF → Key map**.

## Data

- Annotations: `<vault>/附件/Ink 标注/<path of the PDF>.json` (folder configurable).
- The PDF itself is never written to.
- Legacy eraser masks from very old builds are deleted on load (one `.bak` is written first); the
  ink those masks covered becomes visible again.

## Known limitations

- Desktop only; not tested on mobile.
- Rotated rectangles/ellipses are baked into polygons (visually identical, no longer a "shape").
- Annotations of a PDF live in the vault that contains that PDF.

## Development

```bash
npm install
npm run build          # tsc --noEmit + esbuild
npm test               # node --import tsx --test tests/*.test.ts
```

If the environment forbids spawning child processes (some sandboxes), bundle each test with esbuild
and run it with plain `node`; see `docs/handoff-*.md` for the exact commands used in this project.

```
src/                 TypeScript sources
tests/               unit tests + jsdom end-to-end
scripts/deploy.mjs   copy the build into <vault>/.obsidian/plugins/inkstone-pdf
main.js styles.css   build output (committed so any tag is installable)
```

## License

MIT — see [LICENSE](LICENSE). Bundled dependencies and their notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## 中文说明

在 **Obsidian 里直接手写批注 PDF**：压感、图层、布尔裁剪橡皮、撤销/重做；笔迹存在库内的独立文件里，**原 PDF 一个字节都不改**。

> 插件名 **Inkstone PDF**（id `inkstone-pdf`），仅桌面端，Obsidian 1.8.0+。

![完整的 Obsidian 窗口：PDF 页面上的图形、选中框与笔尖菜单](./docs/images/hero.png)

![同样保留整个窗口：旋转后的选中框与实时缩放读数](./docs/images/selection-rotate.png)

![浮动工具栏：工具、常用色、撤销、图层](./docs/images/toolbar.png)

### 解决什么问题

PDF 阅读器只能高亮，手写要去 iPad，写完还得导出、截图、手动誊回笔记——批注和笔记永远是两套东西。Inkstone PDF 把 Obsidian 的 PDF 视图变成一张可以直接写的纸，笔迹和你的笔记待在同一个库里。

- **落笔即写**，压感逐点生效，不需要先切"绘制模式"；
- **布尔裁剪橡皮**：擦过的地方是真的被挖掉，移动笔迹也不会重新冒出来；
- **有向选区**：四角自由缩放、边中点单轴缩放、圆点旋转（15° 吸附）、方向键微移、复制/剪切/粘贴；
- **文档级图层**：批注写一层、答案写一层，隐藏一层就能自己考自己；
- **数位板适配**：按住键临时橡皮、Shift 贴页面拖动改粗细、所有工具键位可重绑；
- **原 PDF 不动**：笔迹存在库内的侧车 JSON，跟随库同步，可撤销。

### 安装

**社区目录**：设置 → 第三方插件 → 浏览 → 搜索 **Inkstone PDF** → 安装 → 启用。

**手动**：下载最新 Release 里的 `main.js`、`manifest.json`、`styles.css`，放到 `<你的库>/.obsidian/plugins/inkstone-pdf/`，重启 Obsidian（或 `Ctrl/Cmd+R`），再到 设置 → 第三方插件 启用。

### 用法速查

| 操作 | 方式 |
| --- | --- |
| 书写 | 选钢笔，直接在 PDF 页面上写 |
| 工具 | `P` 钢笔 · `H` 荧光笔 · `E` 橡皮 · `S` 选择 · `L` 直线 · `A` 箭头 · `R` 矩形 · `O` 椭圆 · `G` 拖拽页面 |
| 笔刷面板 | 双击（或右键/长按）笔刷按钮 |
| 临时橡皮 | 按住 `F`，松手回到原来那支笔 |
| 调笔刷 | 按住 `Shift`，让笔**贴着页面**移动：左右改粗细、上下改不透明度 |
| 选中笔迹 | 选择工具拖框；之后拖动、缩放、旋转、方向键微移 |
| 文本选择 | 选择工具 + `Alt`（把页面交还给 PDF 文本层） |
| 撤销/重做 | `Ctrl/Cmd+Z` · `Ctrl/Cmd+Shift+Z` |

以上键位都能在 **设置 → Inkstone PDF → 键位映射** 里改。

### 数据

- 批注：`<库>/附件/Ink 标注/<PDF 路径>.json`（文件夹可改）。
- 不写入原 PDF。
- 更早版本的橡皮蒙版会在加载时被删除（先写一份 `.bak`），被它们盖住的墨迹会重新显示。

### 已知限制

- 仅桌面端，未在移动端测试。
- 旋转过的矩形/椭圆会被烘焙成多边形（外观一致，但不再是"形状"）。
- 同一个 PDF 的批注只存在于该 PDF 所在的那个库里。

### 许可

MIT，见 [LICENSE](LICENSE)；打包的第三方代码与声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。