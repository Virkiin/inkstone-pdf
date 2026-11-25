/**
 * English UI text.
 *
 * The keys are the Chinese source strings exactly as they appear in the code
 * (source-language keys, the same shape Excalidraw uses). Anything missing here
 * falls back to the Chinese original, so an untranslated label shows Chinese,
 * never a raw key.
 *
 * `tests/i18n.test.ts` scans `src/` and fails when a UI string has no entry.
 *
 * Terminology follows mature drawing apps rather than literal translation:
 * Photoshop / Krita — Hand tool, Size, Opacity, Erase mode, Layers;
 * Krita / Procreate — Freehand, Lasso, Shape recognition, QuickShape-like snapping;
 * Excalidraw — brush presets, palette.
 * Style: sentence case, short plain sentences, "color" not "colour".
 * Placeholders use `{name}`.
 */
export const EN: Record<string, string> = {
	/* --------------------------------------------------------------------- */
	/* Tools, actions and key groups (`src/keys.ts`, toolbar)                */
	/* --------------------------------------------------------------------- */
	钢笔: "Pen",
	荧光笔: "Highlighter",
	橡皮: "Eraser",
	选择: "Select",
	直线: "Line",
	箭头: "Arrow",
	矩形: "Rectangle",
	椭圆: "Ellipse",
	拖拽页面: "Hand tool",
	"调色板第 1 色": "Palette color 1",
	"调色板第 2 色": "Palette color 2",
	"调色板第 3 色": "Palette color 3",
	"调色板第 4 色": "Palette color 4",
	"调色板第 5 色": "Palette color 5",
	"调色板第 6 色": "Palette color 6",
	"调色板第 7 色": "Palette color 7",
	"调色板第 8 色": "Palette color 8",
	"调色板第 9 色": "Palette color 9",
	工具: "Tools",
	颜色: "Colors",
	"笔 / 拖拽切换": "Toggle pen / hand tool",

	/* --------------------------------------------------------------------- */
	/* Toolbar (`src/ui/toolbar.ts`)                                         */
	/* --------------------------------------------------------------------- */
	"钢笔 (P，双击/长按开面板)": "Pen (P; double-click or long-press for the brush panel)",
	"荧光笔 (H，双击/长按开面板)":
		"Highlighter (H; double-click or long-press for the brush panel)",
	"橡皮 (E，双击/长按切换模式)": "Eraser (E; double-click or long-press to switch mode)",
	"选择（双击/长按切换模式）": "Select (double-click or long-press to switch mode)",
	"拖拽页面 (G)": "Hand tool (G)",
	收起工具栏: "Collapse toolbar",
	展开工具栏: "Expand toolbar",
	"撤销 (Ctrl+Z)": "Undo (Ctrl+Z)",
	"重做 (Ctrl+Shift+Z)": "Redo (Ctrl+Shift+Z)",
	图层面板: "Layers",
	切换工具栏布局: "Cycle toolbar layout",
	"切换工具栏布局（当前：{layout}）": "Cycle toolbar layout (current: {layout})",
	"当前图层，点击打开图层面板": "Active layer; click to open the layers panel",
	"图层：{name}": "Layer: {name}",
	无图层: "No layer",
	"{color}（长按替换为当前笔色）": "{color} (long-press to replace with the current pen color)",
	选择区域: "Selection area",
	矩形选择: "Rectangle",
	套索选择: "Lasso",
	横向: "Horizontal",
	纵向: "Vertical",
	方形: "Square",

	/* --------------------------------------------------------------------- */
	/* Brush presets, color names (`src/brush.ts`)                           */
	/* --------------------------------------------------------------------- */
	涂抹: "Freehand",
	套索: "Lasso",
	只擦选中: "Partial",
	整笔删除: "Whole stroke",
	黑: "Black",
	深灰: "Dark gray",
	灰: "Gray",
	红: "Red",
	深红: "Dark red",
	粉: "Pink",
	橙: "Orange",
	黄: "Yellow",
	芥末: "Mustard",
	绿: "Green",
	橄榄: "Olive",
	青: "Teal",
	蓝: "Blue",
	深蓝: "Navy",
	紫: "Purple",
	棕: "Brown",
	"红 · 2.5": "Red · 2.5",
	"黑 · 2.5": "Black · 2.5",
	"蓝 · 5": "Blue · 5",
	"黄 · 12": "Yellow · 12",
	"矩形 · 16": "Rectangle · 16",
	"涂抹 · 16": "Freehand · 16",

	/* --------------------------------------------------------------------- */
	/* Settings (`src/settings.ts`)                                          */
	/* --------------------------------------------------------------------- */
	"Inkstone PDF 设置": "Inkstone PDF settings",
	界面语言: "Interface language",
	"默认跟随 Obsidian 的界面语言。切换后设置页与工具栏立即更新；命令面板里的命令名称要重载插件后才会变。":
		"Follows Obsidian's interface language by default. The settings page and the toolbar update immediately; command names in the command palette are updated too, unless the host refuses to re-register them — then reload the plugin once.",
	"跟随 Obsidian": "Follow Obsidian",
	批注数据文件夹: "Annotation folder",
	"每份 PDF 的笔迹保存为该文件夹下的同名 JSON（如 附件/Ink 标注/资料/高数.pdf.json），随 Obsidian Sync 同步。":
		"Each PDF's ink is saved as a JSON file of the same name inside this folder (for example 附件/Ink 标注/资料/calculus.pdf.json), so it syncs with Obsidian Sync.",
	输入方式: "Input",
	硬件: "Hardware",
	"触屏平板（iPad / Surface）笔尖与笔画在同一点，停住/双击这类手势看得见；数位板（Wacom / 高漫 / 绘王 / XPPen）手在板上、眼在屏上，手势看不见也难控。选「数位板」会关掉手势并启用侧键临时橡皮，之后每一项仍可单独改。":
		"On a touch screen (iPad, Surface) the pen tip and the ink are in the same place, so hold-still and double-tap are visible. On a pen tablet (Wacom, Gaomon, Huion, XPPen) your hand is on the tablet and your eyes are on the screen, so those gestures are invisible and easy to misfire. Choosing \"Pen tablet\" turns the gestures off and enables the side-button temporary eraser; every item below can still be changed on its own.",
	"自动（保持现有设置）": "Automatic (keep current settings)",
	"触屏平板（保留手势）": "Touch screen (keep gestures)",
	"数位板（关手势，走按键）": "Pen tablet (no gestures, use keys)",
	"[Inkstone PDF] 已套用数位板预设：手势关闭，侧键保留为临时橡皮":
		"[Inkstone PDF] Pen tablet preset applied: gestures off, side button kept as the temporary eraser",
	"[Inkstone PDF] 已套用触屏预设：手势开启": "[Inkstone PDF] Touch preset applied: gestures on",
	书写: "Writing",
	"墨迹清晰度 / 流畅度": "Ink quality (sharpness / smoothness)",
	"画布像素预算。预算越小，每次落笔后浏览器要上传/重绘的纹理越小、书写越顺；预算越大，放大后笔迹越锐利。缩放会自动适配：看整页时通常是 2 倍，放大后按预算封顶。":
		"Canvas pixel budget per page. A smaller budget means less texture for the browser to upload and repaint after every stroke, so writing stays smooth; a larger one keeps ink sharp when you zoom in. Zoom adapts on its own: a whole page usually renders at 2x, and zooming in is capped by the budget.",
	"极流畅（约 1.2 Mpx/页）": "Fastest (about 1.2 Mpx per page)",
	"流畅优先（约 2.4 Mpx/页）": "Smooth (about 2.4 Mpx per page)",
	"平衡（约 4 Mpx/页）": "Balanced (about 4 Mpx per page)",
	"清晰优先（约 8 Mpx/页）": "Sharp (about 8 Mpx per page)",
	"关闭其他插件的毛玻璃背景": "Disable other plugins' frosted-glass backgrounds",
	"实测：页面上方有 backdrop-filter（毛玻璃）时，Chromium 会在每一笔的每个采样点重新栅格化那块模糊，长任务 100ms 起。开启后 Inkstone PDF 加载期间会常驻关闭已知的几处毛玻璃（Editing Toolbar 等）。若某插件按钮看起来变透明/难看，可关掉此项。":
		"Measured: when a backdrop-filter (frosted glass) sits above the page, Chromium re-rasterizes that blur at every sample of every stroke, and long tasks start at 100 ms. When enabled, the known blur patches (Editing Toolbar and similar) stay off while Inkstone PDF is loaded. If another plugin's buttons start looking transparent or broken, switch this off.",
	"Shift + 悬停调笔刷的灵敏度": "Sensitivity of Shift-hover brush adjustment",
	"按住 Shift 让笔在页面上方移动：左右改粗细、上下改不透明度。数值越大，同样的移动距离改得越多（1 最慢，10 最快）。":
		"Hold Shift and move the pen over the page: left and right change the size, up and down change the opacity. Higher values change more for the same distance (1 is the slowest, 10 the fastest).",
	"低延迟画布（实验）": "Low-latency canvas (experimental)",
	"给进行中的笔迹画布启用 Chrome 的 desynchronized 低延迟模式。规范允许该模式返回过期像素，已在 dev.64 实测导致「抬笔后笔迹消失」，默认关闭；想试可打开后重新打开 PDF。":
		"Uses Chrome's desynchronized low-latency mode for the in-progress stroke canvas. The spec allows this mode to hand back stale pixels, and it made strokes disappear on pen-up in testing here, so it is off by default. Reopen the PDF after turning it on.",
	数位笔直接书写: "Draw with the stylus without a mode switch",
	"笔尖落在 PDF 页面上即开始画，不需要先进入绘制模式；按住 Alt 可临时选字/点链接。":
		"A pen tip on a PDF page starts drawing straight away, no drawing mode needed. Hold Alt to select text or click links instead.",
	"鼠标也直接书写（兜底）": "Let the mouse draw too (fallback)",
	"如果手写板驱动把笔上报成鼠标，打开此项；平时建议关闭，否则鼠标会无法选字。":
		"Turn this on if your tablet driver reports the pen as a mouse. Keep it off normally, otherwise the mouse can no longer select text.",
	始终显示工具栏: "Always show the toolbar",
	"关闭后，只有进入绘制模式或按 Ribbon 时才显示 PDF 右上角的工具栏。":
		"When off, the toolbar in the top-right corner of the PDF only appears in drawing mode or when you press the ribbon icon.",
	"批注：开（点击变成普通阅读）": "Annotations on — click for a plain reader",
	"批注：关（点击开始批注）": "Annotations off — click to annotate",
	工具栏布局: "Toolbar layout",
	"横向适合宽屏；纵向适合靠边竖排；方形会紧凑换行，适合小窗口。":
		"Horizontal suits wide screens, vertical suits a narrow edge, and square wraps compactly for small windows.",
	"拖拽工具下 Shift 缩放的灵敏度": "Sensitivity of Shift-drag zoom with the hand tool",
	输入抖动修正: "Input smoothing",
	"对笔迹做速度自适应平滑：慢速书写时抑制手抖，快速笔画几乎不过滤。代价是 0.5–2 帧延迟，「中」比「轻」更明显。":
		"Speed-adaptive smoothing of the pen path: it suppresses hand tremor at slow speeds and barely touches fast strokes. It costs 0.5–2 frames of latency, and \"Medium\" is more noticeable than \"Light\".",
	关: "Off",
	轻: "Light",
	中: "Medium",
	"在拖拽工具下按住 Shift 上下拖动：向上放大、向下缩小。数值越大，同样的拖动距离缩放得越多（1 最慢，5 最快）。":
		"With the hand tool, hold Shift and drag up or down: up zooms in, down zooms out. Higher values zoom more for the same distance (1 is the slowest, 5 the fastest).",
	键位映射: "Key bindings",
	"只在 PDF 视图是当前面板、且焦点不在输入框时生效。数位板驱动或笔的侧键映射出来的键盘按键，直接填在这里。点输入框后按一个键即录制，Esc 清空。注意别把同一个键也绑到 Obsidian 自带快捷键上，否则会执行两次。":
		"Only active while a PDF view is the focused pane and the focus is not in a text field. Keys your tablet driver or pen side button sends go straight here. Click a field and press a key to record it; Esc clears it. Do not bind the same key in Obsidian's own hotkeys as well, or the action runs twice.",
	"每个工具后面还有一个「点按 / 按住」：点按＝按一下就切过去并一直用它；按住＝按下临时切过去，**松开立刻回到原来那支笔** —— 笔侧键映射成 E 时选这个，才是数位板上「按住擦、松手继续写」的手感。":
		"Every tool also has a Tap / Hold switch. Tap switches to that tool and keeps it. Hold switches only while the key is down and returns to the previous pen the moment you release it — that is the tablet feel of \"hold to erase, release to keep writing\", so pick Hold for a side button mapped to E.",
	点按切换: "Tap to switch",
	按住生效: "Hold to apply",
	"记录按键事件（排查侧键用）": "Log key events (for side-button debugging)",
	"打开后，PDF 视图里每次按键的 keydown / keyup 都写进 debug.json 的日志。笔侧键映射不生效时打开它、按几下侧键、再导出诊断信息，就能看出驱动到底发的是什么键（或者根本没发键）。":
		"When on, every keydown / keyup inside a PDF view is written to the log in debug.json. If the pen side button does nothing, turn this on, press the button a few times, then export diagnostics: the log shows what the driver actually sends, or that it sends nothing at all.",
	恢复默认键位: "Reset key bindings",
	"工具回到 P / H / E / S / L / A / R / O / G，颜色回到 1–9。":
		"Tools return to P / H / E / S / L / A / R / O / G and colors to 1–9.",
	恢复默认: "Reset to defaults",
	默认颜色: "Default color",
	默认粗细: "Default size",
	"单位：A4 页面 100% 缩放下的像素": "In pixels on an A4 page at 100% zoom",
	不透明度: "Opacity",
	"100% 是不透明。降低后同一个预设也能当淡色马克笔用。":
		"100% is fully opaque. Lower it to use the same preset as a pale marker.",
	擦除方式: "Erase mode",
	"涂抹：只擦掉框选到的部分，笔迹会被切成几段；整笔：框到一点就整条删除。":
		"Partial cuts away only the covered part and splits the stroke; Whole stroke deletes a stroke as soon as any of it is touched.",
	"涂抹（只擦选中部分）": "Partial (cut the stroke)",
	"整笔（碰到就整条删）": "Whole stroke (delete on touch)",
	擦除区域: "Eraser shape",
	"自由涂抹沿笔迹擦；矩形和套索框选一块区域。":
		"Freehand erases along the stroke; Rectangle and Lasso erase inside a dragged shape.",
	自由涂抹: "Freehand",
	矩形框选: "Rectangle",
	套索框选: "Lasso",
	橡皮半径: "Eraser size",
	"单位：A4 页面 100% 缩放下的像素；只擦除当前图层。":
		"In pixels on an A4 page at 100% zoom. Only the active layer is erased.",
	手势: "Gestures",
	"这组手势依赖「看得见笔尖停在哪里」，适合触屏平板；数位板上手在板、眼在屏，停住看不见，误触率高。在「输入方式 → 硬件」里选数位板会自动关掉它们。":
		"These gestures rely on seeing where the pen tip rests, which suits a touch screen. On a pen tablet your hand is on the tablet and your eyes are on the screen, so the hold is invisible and misfires are common. Choosing a pen tablet under Input → Hardware turns them off.",
	"停住笔尖：轻压选中 / 重压擦除": "Hold still: light pressure selects, heavy pressure erases",
	"一个手势两个出口：压力低于阈值切到选择工具并继续框选，高于阈值直接擦除。落笔仍然立刻出墨，判定成立才回滚刚画的那一点。关掉即两个一起关。":
		"One gesture, two outcomes: pressure below the threshold switches to the select tool and keeps the box selection going; pressure above it erases. Ink still appears immediately and is rolled back once the decision is made. Turning this off disables both.",
	"选择工具里双击 / 长按弹菜单": "Double-click / long-press opens the menu in the select tool",
	"在笔迹或空白处双击（或长按）弹出复制/剪切/粘贴菜单，触屏平板上顺手，数位板上双击容易误触发。关掉后改用 Ctrl+C / Ctrl+X / Ctrl+V 与 Delete。":
		"Double-click (or long-press) a stroke or empty space to open the copy / cut / paste menu. Handy on a touch screen; on a pen tablet a double-click is easy to trigger by accident. When off, use Ctrl+C / Ctrl+X / Ctrl+V and Delete.",
	按住时间: "Hold duration",
	"笔尖停住多久算长按（毫秒）。太短容易误触发，太长手感发钝。":
		"How long the pen rests before it counts as a long press, in milliseconds. Too short misfires; too long feels sluggish.",
	压力判定窗口: "Pressure window",
	"长按开始后的这段时间内，只要压力超过阈值就会进入擦除；超过窗口还没压够则不会触发。":
		"During this window after the hold starts, any pressure above the threshold starts erasing; if the window ends first, nothing happens.",
	静止判定半径: "Still radius",
	"笔尖停在下笔点这个半径范围内就算没动，超过才算开始书写。单位：屏幕像素。":
		"The pen tip counts as resting while it stays within this radius of where it touched down, in screen pixels; leaving the radius starts a stroke.",
	擦除触发压力: "Erase pressure threshold",
	"同一个长按手势：压力低于这个值算「选中」，高于它才算「擦除」。数位笔常见压力在 0.3–0.7，建议 0.5–0.6。":
		"For the same hold gesture, pressure below this value selects and above it erases. Pens commonly report 0.3–0.7; 0.5–0.6 works well.",
	擦头随压力变化: "Pressure changes the eraser size",
	"压得越重擦得越宽。关闭后擦头恒定为上面的橡皮半径。":
		"Press harder to erase wider. When off, the eraser keeps the size set above.",
	自动识别图形: "Shape recognition",
	画完自动变标准图形: "Snap to perfect shapes",
	"把干净的直线、箭头、矩形、椭圆、三角/多边形替换成标准图形；手写文字不会被识别。":
		"Turns clean lines, arrows, rectangles, ellipses and triangles or polygons into exact shapes. Handwriting is left alone.",
	触发方式: "Trigger",
	"「停顿」需要画完后笔尖稍作停留；「立即」每笔都尝试识别，更容易误判。":
		"\"Pause\" waits for the pen to rest at the end of a stroke; \"Immediately\" tries on every stroke and misreads more often.",
	画完停顿一下: "Pause after drawing",
	画完立即识别: "Recognize immediately",
	停顿时间: "Pause duration",
	"抬笔前笔尖需要停住多久（毫秒），仅「画完停顿」模式生效。干净的长直线和规整的方框、圆会比这个时间更早完成识别。":
		"How long the pen rests before you lift it, in milliseconds. Only used by the pause trigger. Clean long lines and regular boxes or circles are recognized sooner than this.",
	常用色与调色板: "Quick colors and palette",
	工具栏常用色: "Quick colors in the toolbar",
	"工具栏上常驻的一行颜色，只显示 1–6 格。点一下切换颜色；在工具栏上长按某一格会用当前笔色替换它。":
		"A row of colors that stays on the toolbar, one to six swatches. Click to switch color; long-press a swatch on the toolbar to replace it with the current pen color.",
	添加一格: "Add a swatch",
	调色板: "Palette",
	"笔刷面板里的颜色网格。这里改完立刻生效；面板里长按色格也能改色，「＋」加一格，拖出面板删除。":
		"The grid of colors in the brush panel. Changes here apply immediately; in the panel you can long-press a swatch to recolor it, press + to add one, or drag it out to delete it.",
	恢复默认调色板: "Reset palette",
	笔刷预设: "Brush presets",
	"预设是「颜色 + 粗细 + 不透明度」的整套组合。在工具栏双击/长按笔刷按钮打开面板，点「＋」把当前状态存成预设；这里可以删掉不要的。":
		"A preset is one combo of color, size and opacity. Double-click or long-press a brush button on the toolbar to open the panel, then press + to save the current state as a preset; delete the ones you do not need here.",
	"{label}：还没有预设": "{label}: no presets yet",
	"重复绑定：{names}": "Duplicate binding: {names}",
	最近使用的颜色: "Recent colors",
	"工具栏调色板会自动记录最近用过的颜色，这里可以清空。":
		"The toolbar palette remembers recently used colors; clear them here.",
	清空: "Clear",
	使用: "Usage",
	"键位都在上面的「键位映射」里改。默认：P/H/E/S/L/A/R/O/G 切工具、1–9 快选调色板色、Ctrl+Z 撤销、Ctrl+Shift+Z 重做、Esc 退出绘制模式；按住 F（可改）= 临时橡皮，松开回到原来那支笔。":
		"Everything here is rebound under Key bindings above. Defaults: P/H/E/S/L/A/R/O/G switch tools, 1–9 pick palette colors, Ctrl+Z undo, Ctrl+Shift+Z redo, Esc leaves drawing mode; hold F (rebindable) for a temporary eraser and release to get the previous pen back.",
	未绑定: "Unbound",
	"按住 = 临时橡皮": "Hold = temporary eraser",
	"按住这个键切到橡皮，松开立刻回到原来那支笔（原工具的橡皮参数不受影响）。留空关闭。":
		"Hold this key to switch to the eraser and release to get the previous pen back (the eraser settings of the tool are untouched). Leave it empty to disable.",
	"侧键被识别成鼠标右键 / 中键": "Side button arrives as a right / middle mouse button",
	"有的驱动把笔侧键映射成鼠标按键而不是键盘。选对了就把「按住侧键时落笔」当作临时橡皮。先用「导出诊断信息」看日志里 btn= 的值再确定。":
		"Some drivers report the pen side button as a mouse button instead of a key. Pick the right one and holding it while the tip is down acts as the temporary eraser. Check the btn= values in the exported diagnostics log first.",
	"不用（默认）": "Off (default)",
	"右键（button=2）": "Right (button=2)",
	"中键（button=1）": "Middle (button=1)",

	/* --------------------------------------------------------------------- */
	/* Brush panel (`src/ui/brush-panel.ts`)                                 */
	/* --------------------------------------------------------------------- */
	粗细: "Size",
	把当前笔刷状态存成预设: "Save the current brush as a preset",
	重命名: "Rename",
	覆盖为当前: "Overwrite with current",
	删除: "Delete",
	"{color}（长按改色，拖出面板删除）":
		"{color} (long-press to recolor, drag out of the panel to delete)",
	"{region} · {scope} · 半径 {width}px": "{region} · {scope} · size {width}px",
	把当前笔色加进调色板: "Add the current pen color to the palette",
	"[Inkstone PDF] 这个颜色已经在调色板里了": "[Inkstone PDF] That color is already in the palette",
	色相: "Hue",
	饱和: "Saturation",
	明度: "Brightness",

	/* --------------------------------------------------------------------- */
	/* Layers panel (`src/ui/layers-content.ts`, `src/ui/layers-view.ts`)     */
	/* --------------------------------------------------------------------- */
	"{count} 个图层": "{count} layers",
	"尚未打开 PDF": "No PDF open",
	新建图层: "New layer",
	"[Inkstone PDF] 请先打开一个 PDF 文件": "[Inkstone PDF] Open a PDF first",
	"打开一个 PDF，点击铅笔（或命令「Inkstone PDF: 开启/关闭绘制模式」）即可开始批注。笔迹会按图层保存。":
		"Open a PDF and click the pencil (or run the \"Inkstone PDF: toggle drawing mode\" command) to start annotating. Ink is saved per layer.",
	"列表从上到下即绘制层级（上方覆盖下方）。双击图层名可重命名。":
		"The list is the stacking order: rows above cover rows below. Double-click a layer name to rename it.",
	隐藏图层: "Hide layer",
	显示图层: "Show layer",
	解锁图层: "Unlock layer",
	锁定图层: "Lock layer",
	上移一层: "Move layer up",
	下移一层: "Move layer down",
	删除图层: "Delete layer",
	"确定删除「{name}」吗？": "Delete \"{name}\"?",
	"Inkstone PDF 图层": "Inkstone PDF layers",

	/* --------------------------------------------------------------------- */
	/* Stroke menu (`src/ui/selection-menu.ts`)                              */
	/* --------------------------------------------------------------------- */
	复制: "Copy",
	剪切: "Cut",
	粘贴: "Paste",
	先选中一条笔迹: "Select a stroke first",
	"剪贴板是空的：先复制或剪切笔迹": "The clipboard is empty: copy or cut some ink first",

	/* --------------------------------------------------------------------- */
	/* Commands, notices and diagnostics (`src/main.ts`)                     */
	/* --------------------------------------------------------------------- */
	"Inkstone PDF：开启/关闭绘制": "Inkstone PDF: toggle drawing",
	全部画布: "All canvases",
	"只隐藏 live": "Hide live only",
	隐藏全部: "Hide all",
	"[Inkstone PDF] 归因测试：约 15 秒，全程别动笔、别滚动（当前 {count} 块画布）":
		"[Inkstone PDF] Attribution test: about 15 s. Do not write or scroll meanwhile ({count} canvases)",
	"空闲时本来就不卡 → 卡顿在操作瞬间，查提交/擦除路径":
		"Idle was never the problem — stutter happens at the moment of an action; check the commit / erase path",
	"live 层是大头 → 直接绘制（去掉 live 层）":
		"The live layer dominates — draw directly (drop the live layer)",
	"committed 层是大头 → 降预算或分块渲染":
		"The committed layer dominates — lower the budget or render in tiles",
	"隐藏画布没区别 → 阻塞来自外部（pdf.js / 其他插件），需要二分关插件":
		"Hiding canvases changes nothing — the blocking comes from outside (pdf.js / other plugins); bisect the plugins",
	"{label} {count} 次/{total}ms": "{label}: {count} times / {total} ms",
	"归因: {detail} · {verdict}": "Attribution: {detail} · {verdict}",
	"[Inkstone PDF] PDF 正在加载，请稍后再试":
		"[Inkstone PDF] The PDF is still loading, try again in a moment",
	"开启/关闭绘制模式": "Toggle drawing mode",
	"工具：钢笔": "Tool: Pen",
	"工具：荧光笔": "Tool: Highlighter",
	"工具：橡皮": "Tool: Eraser",
	"工具：选择": "Tool: Select",
	"工具：直线": "Tool: Line",
	"工具：箭头": "Tool: Arrow",
	"工具：矩形": "Tool: Rectangle",
	"工具：椭圆": "Tool: Ellipse",
	"工具：拖拽页面": "Tool: Hand tool",
	撤销笔迹: "Undo stroke",
	重做笔迹: "Redo stroke",
	"清空本 PDF 的全部墨迹（不可撤销）": "Clear all ink in this PDF (cannot be undone)",
	"[Inkstone PDF] 请先打开一个 PDF 文件并等它加载完":
		"[Inkstone PDF] Open a PDF and wait for it to finish loading",
	清空墨迹: "Clear ink",
	"将从《{file}》删除全部 {count} 条笔迹（图层保留）。删除前会写一份 .bak 备份，删除后无法撤销。":
		"Delete all {count} strokes from \"{file}\" (layers are kept). A .bak backup is written first; this cannot be undone.",
	"当前 PDF": "this PDF",
	"[Inkstone PDF] 已清空 {count} 条笔迹": "[Inkstone PDF] Cleared {count} strokes",
	"[Inkstone PDF] 没有可清空的笔迹": "[Inkstone PDF] There is no ink to clear",
	"重置笔迹会话（笔卡住时用）": "Reset ink session (when the pen gets stuck)",
	"[Inkstone PDF] 已重置：会话关闭、临时工具撤销、工具回到钢笔":
		"[Inkstone PDF] Reset: session closed, temporary tool released, back to the pen",
	打开图层面板: "Open layers panel",
	"导出诊断信息（调试用）": "Export diagnostics (debug)",
	"[Inkstone PDF] 诊断信息已写入插件目录 debug.json":
		"[Inkstone PDF] Diagnostics written to debug.json in the plugin folder",
	"显示性能摘要（调试用）": "Show performance summary (debug)",
	"[Inkstone PDF] 还没有性能采样：先写几笔再试":
		"[Inkstone PDF] No samples yet; write a few strokes first",
	"画布基准测试（排查卡顿用）": "Canvas benchmark (for stutter hunting)",
	"卡顿归因测试（8 秒，A/B 画布）": "Stutter attribution test (8 s, A/B canvases)",
	"画布 {width}x{height}（{mpx} Mpx）· 全页 clear {clearFull}ms · 区域 clear {clearBox}ms · 300 段逐段 {seg300}ms · 300 段单路径 {path300}ms · 区域 blit {blit}ms · 逐帧(离屏) avg {frameAvg}ms p95 {frameP95}ms · 逐帧(叠加在 PDF 页上) avg {inPageAvg}ms p95 {inPageP95}ms · {gpu}":
		"Canvas {width}x{height} ({mpx} Mpx) · full clear {clearFull} ms · region clear {clearBox} ms · 300 segments one by one {seg300} ms · 300 segments one path {path300} ms · region blit {blit} ms · frames offscreen avg {frameAvg} ms p95 {frameP95} ms · frames over the PDF page avg {inPageAvg} ms p95 {inPageP95} ms · {gpu}",
	"粗细 {size}px · 不透明度 {opacity}%": "Size {size}px · Opacity {opacity}%",
	清空性能采样: "Reset performance samples",
	"[Inkstone PDF] 性能采样已清空": "[Inkstone PDF] Performance samples cleared",

	/* --------------------------------------------------------------------- */
	/* Controller notices and HUD (`src/controller.ts`, `src/doc.ts`)        */
	/* --------------------------------------------------------------------- */
	"批注正在加载，请再写一次": "Annotations are still loading, write that stroke again",
	移动笔迹: "Move ink",
	缩放笔迹: "Scale ink",
	旋转笔迹: "Rotate ink",
	微移笔迹: "Nudge ink",
	调整端点: "Adjust endpoint",
	水平镜像: "Flip horizontal",
	垂直镜像: "Flip vertical",
	水平镜像笔迹: "Flip ink horizontally",
	垂直镜像笔迹: "Flip ink vertically",
	"直线、箭头和多边形不能被镜像": "Lines, arrows and polygons cannot be flipped",
	"已复制 {count} 条笔迹": "Copied {count} strokes",
	删除笔迹: "Delete ink",
	"当前图层被锁定或不可见，无法粘贴": "The active layer is locked or hidden; cannot paste",
	整笔擦除: "Erase whole stroke",
	"图层 {count}": "Layer {count}",
	"图层 1": "Layer 1",
	调整图层顺序: "Reorder layers",
	形状: "Shape",
	绘制: "Draw",
	图形识别: "Shape recognition",
	擦除: "Erase",
	"当前图层已隐藏，无法绘制": "The active layer is hidden; cannot draw",
	"当前图层已锁定，无法绘制": "The active layer is locked; cannot draw",
	取消: "Cancel",
};
