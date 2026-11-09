# Inkstone PDF

Handwrite, sketch and annotate directly on PDF pages **inside Obsidian** — with pressure, layers,
undo/redo, and annotations stored separately so your PDF is never modified.

> **Inkstone PDF** (id `inkstone-pdf`) · desktop only · Obsidian 1.8.0+

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
