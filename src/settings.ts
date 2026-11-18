import { Notice, PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import type { BrushPreset, EraserPreset, PresetKind } from "./brush";
import { t, translateBuiltin } from "./i18n";
import type { JitterFilter } from "./smoothing";
import type { UiLanguage } from "./i18n";
import { ACTIONS, findConflicts, formatKeySpec, normalizeSpec, resolveBindings, specFromEvent } from "./keys";
import type PdfInkPlugin from "./main";
import type { EraserRegion, EraserScope } from "./types";

export interface PdfInkSettings {
	/** vault folder that stores the annotation sidecar files */
	folder: string;
	/** UI language: follow Obsidian, or force one table */
	language: UiLanguage;
	/** which hardware the gestures are tuned for (preset, not a behaviour flag) */
	inputMode: "auto" | "touch" | "tablet";
	/** action id -> key spec; only actions the user changed are stored */
	keyBindings: Record<string, string>;
	/** tool actions that act while held instead of toggling (id -> true) */
	keyHolds: Record<string, boolean>;
	/** log every key down / up while a PDF is active (pen button diagnosis) */
	logKeyEvents: boolean;
	/** hold this key for a temporary eraser, release to get the old tool back */
	tempEraserKey: string;
	/** pen side button that the driver reports as a mouse button while held */
	tempEraserMouse: "off" | "right" | "middle";
	/** double tap / long press in the select tool opens the stroke menu */
	tapGestureMenuEnabled: boolean;
	/**
	 * Kill other plugins' `backdrop-filter` while PDF Ink is loaded. Measured:
	 * a blurred overlay above the page re-rasterizes on every pen sample, and
	 * toggling it off per stroke (dev.44) helped but cost two re-rasters per
	 * stroke — so it is now applied once, permanently.
	 */
	blurShield: boolean;
	/** Chrome's low-latency canvas hint (experimental, off by default) */
	lowLatencyLive: boolean;
	/** how fast Shift + pen movement changes size / opacity (1–10) */
	penAdjustSpeed: number;
	penColor: string;
	/** pen width in css px at 100% zoom of an A4 page */
	penWidth: number;
	/** pen opacity, so a "soft pencil" preset is possible */
	penOpacity: number;
	/** saved brush states, one list per tool (see the brush panel) */
	brushPresets: {
		pen: BrushPreset[];
		highlighter: BrushPreset[];
		eraser: EraserPreset[];
	};
	/** the always-visible color row on the toolbar */
	quickColors: string[];
	highlighterColor: string;
	highlighterWidth: number;
	highlighterOpacity: number;
	eraserWidth: number;
	/** how the eraser region is specified */
	eraserRegion: EraserRegion;
	/** whether a touch removes the whole stroke or only the covered part */
	eraserScope: EraserScope;
	/** hold the pen still to start erasing without switching tools */
	eraserHoldEnabled: boolean;
	/** how long the pen has to rest before press-to-erase kicks in */
	eraserHoldMs: number;
	/** how long the gesture keeps listening for the required pressure */
	eraserHoldWindowMs: number;
	/** drift allowed while holding still, in css px */
	eraserHoldRadiusPx: number;
	/** pen pressure that separates "select" from "erase" on a long press */
	eraserHoldPressure: number;
	/** let pen pressure widen the eraser swath */
	eraserPressureSize: boolean;
	/** replace clean hand-drawn lines / circles / boxes with real shapes */
	autoShapeEnabled: boolean;
	autoShapeTrigger: "hold" | "immediate";
	/** how long the pen has to rest at the end of a stroke to trigger recognition */
	autoShapeHoldMs: number;
	selectMode: "rect" | "lasso";
	/** canvas backing-store budget: the main ink crispness / smoothness knob */
	inkQuality: "fast" | "smooth" | "balanced" | "crisp";
	palette: string[];
	recentColors: string[];
	/** drawing with a stylus without entering draw mode */
	stylusFreehand: boolean;
	/** fallback for tablet drivers that report the pen as a mouse */
	mouseFreehand: boolean;
	showToolbarAlways: boolean;
	/** how fast Shift + vertical drag zooms the page with the hand tool (1–5) */
	handZoomSpeed: number;
	/** pen jitter filter: off / light / medium */
	jitterFilter: JitterFilter;
	/** toolbar layout chosen by the user */
	toolbarLayout: "horizontal" | "vertical" | "square";
	/** last toolbar position relative to the PDF view, null = default bottom-right */
	toolbarPos: { x: number; y: number } | null;
}

export const DEFAULT_SETTINGS: PdfInkSettings = {
	folder: "附件/Ink 标注",
	language: "auto",
	inputMode: "auto",
	keyBindings: {},
	keyHolds: {},
	logKeyEvents: false,
	tempEraserKey: "f",
	tempEraserMouse: "off",
	tapGestureMenuEnabled: true,
	blurShield: true,
	lowLatencyLive: false,
	penAdjustSpeed: 5,
	penColor: "#e03131",
	penWidth: 2.5,
	penOpacity: 1,
	brushPresets: {
		pen: [
			{ id: "p-red-25", name: t("红 · 2.5"), color: "#e03131", widthPx: 2.5, opacity: 1 },
			{ id: "p-black-25", name: t("黑 · 2.5"), color: "#1e1e1e", widthPx: 2.5, opacity: 1 },
			{ id: "p-blue-5", name: t("蓝 · 5"), color: "#1971c2", widthPx: 5, opacity: 1 },
		],
		highlighter: [
			{ id: "h-yellow-12", name: t("黄 · 12"), color: "#ffd43b", widthPx: 12, opacity: 0.5 },
		],
		eraser: [
			{ id: "e-free-16", name: t("涂抹 · 16"), region: "free", scope: "partial", widthPx: 16 },
		],
	},
	quickColors: ["#1e1e1e", "#e03131", "#1971c2"],
	highlighterColor: "#ffd43b",
	highlighterWidth: 12,
	highlighterOpacity: 0.5,
	eraserWidth: 16,
	eraserRegion: "free",
	eraserScope: "partial",
	eraserHoldEnabled: true,
	eraserHoldMs: 750,
	eraserHoldWindowMs: 1000,
	eraserHoldRadiusPx: 10,
	eraserHoldPressure: 0.55,
	eraserPressureSize: true,
	autoShapeEnabled: true,
	autoShapeTrigger: "hold",
	autoShapeHoldMs: 350,
	selectMode: "rect",
	inkQuality: "smooth",
	palette: [
		"#1e1e1e",
		"#e03131",
		"#1971c2",
		"#2f9e44",
		"#f08c00",
		"#7048e8",
		"#e64980",
		"#15aabf",
		"#8b5a2b",
		"#868e96",
		"#1c3f94",
		"#9c2b2b",
	],
	recentColors: [],
	stylusFreehand: true,
	mouseFreehand: false,
	showToolbarAlways: true,
	handZoomSpeed: 3,
	jitterFilter: "light",
	toolbarLayout: "horizontal",
	toolbarPos: null,
};

export class PdfInkSettingTab extends PluginSettingTab {
	private readonly plugin: PdfInkPlugin;

	constructor(app: App, plugin: PdfInkPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		while (containerEl.firstChild) containerEl.removeChild(containerEl.firstChild);

		new Setting(containerEl).setName(t("Inkstone PDF 设置")).setHeading();

		new Setting(containerEl)
			.setName(t("界面语言"))
			.setDesc(
				t(
					"默认跟随 Obsidian 的界面语言。切换后设置页与工具栏立即更新；命令面板里的命令名称要重载插件后才会变。",
				),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						auto: t("跟随 Obsidian"),
						zh: "中文",
						en: "English",
					})
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value as UiLanguage;
						await this.plugin.saveSettings();
						this.plugin.applyLanguage();
						this.display();
					}),
			);

		new Setting(containerEl)
			.setName(t("批注数据文件夹"))
			.setDesc(
				t(
					"每份 PDF 的笔迹保存为该文件夹下的同名 JSON（如 附件/Ink 标注/资料/高数.pdf.json），随 Obsidian Sync 同步。",
				),
			)
			.addText((text) =>
				text
					.setPlaceholder("附件/Ink 标注")
					.setValue(this.plugin.settings.folder)
					.onChange(async (value) => {
						this.plugin.settings.folder = value.trim() || "Inkstone PDF";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName(t("输入方式")).setHeading();

		new Setting(containerEl)
			.setName(t("硬件"))
			.setDesc(
				t(
					"触屏平板（iPad / Surface）笔尖与笔画在同一点，停住/双击这类手势看得见；数位板（Wacom / 高漫 / 绘王 / XPPen）手在板上、眼在屏上，手势看不见也难控。选「数位板」会关掉手势并启用侧键临时橡皮，之后每一项仍可单独改。",
				),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						auto: t("自动（保持现有设置）"),
						touch: t("触屏平板（保留手势）"),
						tablet: t("数位板（关手势，走按键）"),
					})
					.setValue(this.plugin.settings.inputMode)
					.onChange(async (value) => {
						const mode = value as PdfInkSettings["inputMode"];
						await this.plugin.applyInputMode(mode);
						if (mode === "auto") return;
						new Notice(
							mode === "tablet"
								? t("[Inkstone PDF] 已套用数位板预设：手势关闭，侧键保留为临时橡皮")
								: t("[Inkstone PDF] 已套用触屏预设：手势开启"),
						);
						this.display();
					}),
			);

		new Setting(containerEl).setName(t("书写")).setHeading();

		new Setting(containerEl)
			.setName(t("墨迹清晰度 / 流畅度"))
			.setDesc(
				t(
					"画布像素预算。预算越小，每次落笔后浏览器要上传/重绘的纹理越小、书写越顺；预算越大，放大后笔迹越锐利。缩放会自动适配：看整页时通常是 2 倍，放大后按预算封顶。",
				),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						fast: t("极流畅（约 1.2 Mpx/页）"),
						smooth: t("流畅优先（约 2.4 Mpx/页）"),
						balanced: t("平衡（约 4 Mpx/页）"),
						crisp: t("清晰优先（约 8 Mpx/页）"),
					})
					.setValue(this.plugin.settings.inkQuality)
					.onChange(async (value) => {
						this.plugin.settings.inkQuality = value as
							| "fast"
							| "smooth"
							| "balanced"
							| "crisp";
						await this.plugin.saveSettings();
						this.plugin.applyInkQuality();
					}),
			);

		new Setting(containerEl)
			.setName(t("关闭其他插件的毛玻璃背景"))
			.setDesc(
				t(
					"实测：页面上方有 backdrop-filter（毛玻璃）时，Chromium 会在每一笔的每个采样点重新栅格化那块模糊，长任务 100ms 起。开启后 Inkstone PDF 加载期间会常驻关闭已知的几处毛玻璃（Editing Toolbar 等）。若某插件按钮看起来变透明/难看，可关掉此项。",
				),
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.blurShield).onChange(async (value) => {
					this.plugin.settings.blurShield = value;
					await this.plugin.saveSettings();
					this.plugin.applyBlurShield();
				}),
			);

		new Setting(containerEl)
			.setName(t("Shift + 悬停调笔刷的灵敏度"))
			.setDesc(
				t(
					"按住 Shift 让笔在页面上方移动：左右改粗细、上下改不透明度。数值越大，同样的移动距离改得越多（1 最慢，10 最快）。",
				),
			)
			.addSlider((slider) =>
				slider
					.setLimits(1, 10, 1)
					.setValue(this.plugin.settings.penAdjustSpeed)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.penAdjustSpeed = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("输入抖动修正"))
			.setDesc(
				t(
					"对笔迹做速度自适应平滑：慢速书写时抑制手抖，快速笔画几乎不过滤。代价是 0.5–2 帧延迟，「中」比「轻」更明显。",
				),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						off: t("关"),
						light: t("轻"),
						medium: t("中"),
					})
					.setValue(this.plugin.settings.jitterFilter)
					.onChange(async (value) => {
						this.plugin.settings.jitterFilter = value as JitterFilter;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("低延迟画布（实验）"))
			.setDesc(
				t(
					"给进行中的笔迹画布启用 Chrome 的 desynchronized 低延迟模式。规范允许该模式返回过期像素，已在 dev.64 实测导致「抬笔后笔迹消失」，默认关闭；想试可打开后重新打开 PDF。",
				),
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.lowLatencyLive).onChange(async (value) => {
					this.plugin.settings.lowLatencyLive = value;
					await this.plugin.saveSettings();
					this.plugin.applyInkQuality();
				}),
			);

		new Setting(containerEl)
			.setName(t("数位笔直接书写"))
			.setDesc(
				t("笔尖落在 PDF 页面上即开始画，不需要先进入绘制模式；按住 Alt 可临时选字/点链接。"),
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.stylusFreehand).onChange(async (value) => {
					this.plugin.settings.stylusFreehand = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(t("鼠标也直接书写（兜底）"))
			.setDesc(
				t("如果手写板驱动把笔上报成鼠标，打开此项；平时建议关闭，否则鼠标会无法选字。"),
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.mouseFreehand).onChange(async (value) => {
					this.plugin.settings.mouseFreehand = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(t("始终显示工具栏"))
			.setDesc(
				t("关闭后，只有进入绘制模式或按 Ribbon 时才显示 PDF 右上角的工具栏。"),
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showToolbarAlways).onChange(async (value) => {
					this.plugin.settings.showToolbarAlways = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(t("工具栏布局"))
			.setDesc(
				t("横向适合宽屏；纵向适合靠边竖排；方形会紧凑换行，适合小窗口。"),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						horizontal: t("横向"),
						vertical: t("纵向"),
						square: t("方形"),
					})
					.setValue(this.plugin.settings.toolbarLayout)
					.onChange(async (value) => {
						this.plugin.settings.toolbarLayout = value as
							| "horizontal"
							| "vertical"
							| "square";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("拖拽工具下 Shift 缩放的灵敏度"))
			.setDesc(
				t(
					"在拖拽工具下按住 Shift 上下拖动：向上放大、向下缩小。数值越大，同样的拖动距离缩放得越多（1 最慢，5 最快）。",
				),
			)
			.addSlider((slider) =>
				slider
					.setLimits(1, 5, 1)
					.setValue(this.plugin.settings.handZoomSpeed)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.handZoomSpeed = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName(t("键位映射")).setHeading();
		containerEl.createEl("p", {
			text:
				t("只在 PDF 视图是当前面板、且焦点不在输入框时生效。数位板驱动或笔的侧键映射出来的键盘按键，直接填在这里。点输入框后按一个键即录制，Esc 清空。注意别把同一个键也绑到 Obsidian 自带快捷键上，否则会执行两次。"),
		});
		containerEl.createEl("p", {
			text:
				t("每个工具后面还有一个「点按 / 按住」：点按＝按一下就切过去并一直用它；按住＝按下临时切过去，**松开立刻回到原来那支笔** —— 笔侧键映射成 E 时选这个，才是数位板上「按住擦、松手继续写」的手感。"),
		});

		this.renderTempEraser(containerEl);

		const bindings = resolveBindings(this.plugin.settings.keyBindings);
		const inputs: Array<{ id: string; el: HTMLInputElement }> = [];
		for (const group of [...new Set(ACTIONS.map((entry) => entry.group))]) {
			new Setting(containerEl).setName(t(group)).setHeading();
			for (const action of ACTIONS.filter((entry) => entry.group === group)) {
				const el = this.keyRow(
					containerEl,
					t(action.name),
					"",
					bindings[action.id] ?? "",
					(spec) => {
						void this.commitBinding(action.id, spec);
					},
					action.tool
						? (setting) => {
								setting.addDropdown((dropdown) =>
									dropdown
										.addOptions({ tap: t("点按切换"), hold: t("按住生效") })
										.setValue(
											this.plugin.settings.keyHolds[action.id]
												? "hold"
												: "tap",
										)
										.onChange(async (value) => {
											const next = { ...this.plugin.settings.keyHolds };
											if (value === "hold") next[action.id] = true;
											else delete next[action.id];
											this.plugin.settings.keyHolds = next;
											await this.plugin.saveSettings();
										}),
								);
							}
						: undefined,
				);
				inputs.push({ id: action.id, el });
			}
		}
		this.markConflicts(inputs, bindings);

		new Setting(containerEl)
			.setName(t("记录按键事件（排查侧键用）"))
			.setDesc(
				t("打开后，PDF 视图里每次按键的 keydown / keyup 都写进 debug.json 的日志。笔侧键映射不生效时打开它、按几下侧键、再导出诊断信息，就能看出驱动到底发的是什么键（或者根本没发键）。"),
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.logKeyEvents).onChange(async (value) => {
					this.plugin.settings.logKeyEvents = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(t("恢复默认键位"))
			.setDesc(t("工具回到 P / H / E / S / L / A / R / O / G，颜色回到 1–9。"))
			.addButton((button) =>
				button.setButtonText(t("恢复默认")).onClick(async () => {
					this.plugin.settings.keyBindings = {};
					await this.plugin.saveSettings();
					this.display();
				}),
			);

		new Setting(containerEl).setName(t("钢笔")).setHeading();

		new Setting(containerEl).setName(t("默认颜色")).addColorPicker((picker) =>
			picker.setValue(this.plugin.settings.penColor).onChange(async (value) => {
				this.plugin.settings.penColor = value;
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl)
			.setName(t("默认粗细"))
			.setDesc(t("单位：A4 页面 100% 缩放下的像素"))
			.addSlider((slider) =>
				slider
					.setLimits(0.5, 20, 0.5)
					.setValue(this.plugin.settings.penWidth)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.penWidth = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("不透明度"))
			.setDesc(t("100% 是不透明。降低后同一个预设也能当淡色马克笔用。"))
			.addSlider((slider) =>
				slider
					.setLimits(10, 100, 5)
					.setValue(Math.round(this.plugin.settings.penOpacity * 100))
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.penOpacity = value / 100;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName(t("荧光笔")).setHeading();

		new Setting(containerEl).setName(t("默认颜色")).addColorPicker((picker) =>
			picker.setValue(this.plugin.settings.highlighterColor).onChange(async (value) => {
				this.plugin.settings.highlighterColor = value;
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl).setName(t("默认粗细")).addSlider((slider) =>
			slider
				.setLimits(2, 40, 1)
				.setValue(this.plugin.settings.highlighterWidth)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.highlighterWidth = value;
					await this.plugin.saveSettings();
				}),
		);

		new Setting(containerEl).setName(t("不透明度")).addSlider((slider) =>
			slider
				.setLimits(10, 90, 5)
				.setValue(Math.round(this.plugin.settings.highlighterOpacity * 100))
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.highlighterOpacity = value / 100;
					await this.plugin.saveSettings();
				}),
		);

		new Setting(containerEl).setName(t("橡皮")).setHeading();

		new Setting(containerEl)
			.setName(t("擦除方式"))
			.setDesc(
				t("涂抹：只擦掉框选到的部分，笔迹会被切成几段；整笔：框到一点就整条删除。"),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ partial: t("涂抹（只擦选中部分）"), whole: t("整笔（碰到就整条删）") })
					.setValue(this.plugin.settings.eraserScope)
					.onChange(async (value) => {
						this.plugin.settings.eraserScope = value as EraserScope;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("擦除区域"))
			.setDesc(t("自由涂抹沿笔迹擦；矩形和套索框选一块区域。"))
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						free: t("自由涂抹"),
						rect: t("矩形框选"),
						lasso: t("套索框选"),
					})
					.setValue(this.plugin.settings.eraserRegion)
					.onChange(async (value) => {
						this.plugin.settings.eraserRegion = value as EraserRegion;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("橡皮半径"))
			.setDesc(t("单位：A4 页面 100% 缩放下的像素；只擦除当前图层。"))
			.addSlider((slider) =>
				slider
					.setLimits(4, 48, 1)
					.setValue(this.plugin.settings.eraserWidth)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.eraserWidth = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName(t("手势")).setHeading();
		containerEl.createEl("p", {
			text:
				t("这组手势依赖「看得见笔尖停在哪里」，适合触屏平板；数位板上手在板、眼在屏，停住看不见，误触率高。在「输入方式 → 硬件」里选数位板会自动关掉它们。"),
		});

		new Setting(containerEl)
			.setName(t("停住笔尖：轻压选中 / 重压擦除"))
			.setDesc(
				t("一个手势两个出口：压力低于阈值切到选择工具并继续框选，高于阈值直接擦除。落笔仍然立刻出墨，判定成立才回滚刚画的那一点。关掉即两个一起关。"),
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.eraserHoldEnabled).onChange(async (value) => {
					this.plugin.settings.eraserHoldEnabled = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(t("选择工具里双击 / 长按弹菜单"))
			.setDesc(
				t("在笔迹或空白处双击（或长按）弹出复制/剪切/粘贴菜单，触屏平板上顺手，数位板上双击容易误触发。关掉后改用 Ctrl+C / Ctrl+X / Ctrl+V 与 Delete。"),
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tapGestureMenuEnabled)
					.onChange(async (value) => {
						this.plugin.settings.tapGestureMenuEnabled = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("按住时间"))
			.setDesc(t("笔尖停住多久算长按（毫秒）。太短容易误触发，太长手感发钝。"))
			.addSlider((slider) =>
				slider
					.setLimits(200, 800, 50)
					.setValue(this.plugin.settings.eraserHoldMs)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.eraserHoldMs = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("压力判定窗口"))
			.setDesc(
				t("长按开始后的这段时间内，只要压力超过阈值就会进入擦除；超过窗口还没压够则不会触发。"),
			)
			.addSlider((slider) =>
				slider
					.setLimits(500, 2000, 100)
					.setValue(this.plugin.settings.eraserHoldWindowMs)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.eraserHoldWindowMs = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("静止判定半径"))
			.setDesc(t("笔尖停在下笔点这个半径范围内就算没动，超过才算开始书写。单位：屏幕像素。"))
			.addSlider((slider) =>
				slider
					.setLimits(3, 24, 1)
					.setValue(this.plugin.settings.eraserHoldRadiusPx)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.eraserHoldRadiusPx = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("擦除触发压力"))
			.setDesc(
				t("同一个长按手势：压力低于这个值算「选中」，高于它才算「擦除」。数位笔常见压力在 0.3–0.7，建议 0.5–0.6。"),
			)
			.addSlider((slider) =>
				slider
					.setLimits(30, 90, 5)
					.setValue(Math.round(this.plugin.settings.eraserHoldPressure * 100))
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.eraserHoldPressure = value / 100;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("擦头随压力变化"))
			.setDesc(t("压得越重擦得越宽。关闭后擦头恒定为上面的橡皮半径。"))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.eraserPressureSize).onChange(async (value) => {
					this.plugin.settings.eraserPressureSize = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName(t("自动识别图形")).setHeading();

		new Setting(containerEl)
			.setName(t("画完自动变标准图形"))
			.setDesc(t("把干净的直线、箭头、矩形、椭圆、三角/多边形替换成标准图形；手写文字不会被识别。"))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoShapeEnabled).onChange(async (value) => {
					this.plugin.settings.autoShapeEnabled = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(t("触发方式"))
			.setDesc(t("「停顿」需要画完后笔尖稍作停留；「立即」每笔都尝试识别，更容易误判。"))
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ hold: t("画完停顿一下"), immediate: t("画完立即识别") })
					.setValue(this.plugin.settings.autoShapeTrigger)
					.onChange(async (value) => {
						this.plugin.settings.autoShapeTrigger =
							value === "immediate" ? "immediate" : "hold";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("停顿时间"))
			.setDesc(
				t("抬笔前笔尖需要停住多久（毫秒），仅「画完停顿」模式生效。干净的长直线和规整的方框、圆会比这个时间更早完成识别。"),
			)
			.addSlider((slider) =>
				slider
					.setLimits(150, 1500, 50)
					.setValue(this.plugin.settings.autoShapeHoldMs)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.autoShapeHoldMs = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName(t("常用色与调色板")).setHeading();

		new Setting(containerEl)
			.setName(t("工具栏常用色"))
			.setDesc(
				t("工具栏上常驻的一行颜色，只显示 1–6 格。点一下切换颜色；在工具栏上长按某一格会用当前笔色替换它。"),
			);
		const quickWrap = containerEl.createDiv("pdf-ink-settings-swatches");
		const renderQuick = (): void => {
			while (quickWrap.firstChild) quickWrap.removeChild(quickWrap.firstChild);
			this.plugin.settings.quickColors.forEach((color, index) => {
				const cell = quickWrap.createDiv("pdf-ink-settings-swatch");
				const input = cell.createEl("input", { type: "color" });
				input.value = color;
				input.addEventListener("change", async () => {
					this.plugin.settings.quickColors[index] = input.value;
					await this.plugin.saveSettings();
				});
				const remove = cell.createEl("button", {
					cls: "pdf-ink-settings-remove",
					text: "×",
				});
				remove.addEventListener("click", async () => {
					this.plugin.settings.quickColors.splice(index, 1);
					await this.plugin.saveSettings();
					renderQuick();
				});
			});
		};
		renderQuick();
		new Setting(containerEl).addButton((button) =>
			button.setButtonText(t("添加一格")).onClick(async () => {
				if (this.plugin.settings.quickColors.length >= 6) return;
				this.plugin.settings.quickColors.push(
					this.plugin.settings.quickColors.at(-1) ?? "#1e1e1e",
				);
				await this.plugin.saveSettings();
				renderQuick();
			}),
		);

		new Setting(containerEl)
			.setName(t("调色板"))
			.setDesc(
				t("笔刷面板里的颜色网格。这里改完立刻生效；面板里长按色格也能改色，「＋」加一格，拖出面板删除。"),
			);
		const paletteWrap = containerEl.createDiv("pdf-ink-settings-swatches");
		const renderPalette = (): void => {
			while (paletteWrap.firstChild) paletteWrap.removeChild(paletteWrap.firstChild);
			this.plugin.settings.palette.forEach((color, index) => {
				const cell = paletteWrap.createDiv("pdf-ink-settings-swatch");
				const input = cell.createEl("input", { type: "color" });
				input.value = color;
				input.addEventListener("change", async () => {
					this.plugin.setPaletteSlot(index, input.value);
					await this.plugin.saveSettings();
				});
				const remove = cell.createEl("button", {
					cls: "pdf-ink-settings-remove",
					text: "×",
				});
				remove.addEventListener("click", async () => {
					this.plugin.removePaletteColor(index);
					await this.plugin.saveSettings();
					renderPalette();
				});
			});
		};
		renderPalette();
		new Setting(containerEl).addButton((button) =>
			button.setButtonText(t("恢复默认调色板")).onClick(async () => {
				this.plugin.settings.palette = [...DEFAULT_SETTINGS.palette];
				await this.plugin.saveSettings();
				renderPalette();
			}),
		);

		new Setting(containerEl).setName(t("笔刷预设")).setHeading();
		containerEl.createEl("p", {
			text:
				t("预设是「颜色 + 粗细 + 不透明度」的整套组合。在工具栏双击/长按笔刷按钮打开面板，点「＋」把当前状态存成预设；这里可以删掉不要的。"),
		});
		const presetKinds: Array<[PresetKind, string]> = [
			["pen", t("钢笔")],
			["highlighter", t("荧光笔")],
			["eraser", t("橡皮")],
		];
		for (const [kind, label] of presetKinds) {
			const list =
				kind === "eraser"
					? this.plugin.settings.brushPresets.eraser
					: this.plugin.settings.brushPresets[kind];
			const wrap = containerEl.createDiv("pdf-ink-settings-presets");
			if (list.length === 0) {
				wrap.createEl("span", {
					cls: "pdf-ink-settings-empty",
					text: t("{label}：还没有预设", { label }),
				});
				continue;
			}
			for (const preset of list) {
				const chip = wrap.createDiv("pdf-ink-settings-chip");
				const swatch = chip.createDiv("pdf-ink-swatch-mini");
				swatch.setCssStyles({ backgroundColor: "color" in preset ? preset.color : "var(--text-faint)" });
				chip.createEl("span", { text: translateBuiltin(preset.name) });
				const remove = chip.createEl("button", {
					cls: "pdf-ink-settings-remove",
					text: "×",
				});
				remove.addEventListener("click", async () => {
					this.plugin.deletePreset(kind, preset.id);
					await this.plugin.saveSettings();
					this.display();
				});
			}
		}

		new Setting(containerEl).setName(t("颜色")).setHeading();

		new Setting(containerEl)
			.setName(t("最近使用的颜色"))
			.setDesc(t("工具栏调色板会自动记录最近用过的颜色，这里可以清空。"))
			.addButton((button) =>
				button.setButtonText(t("清空")).onClick(async () => {
					this.plugin.settings.recentColors = [];
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName(t("使用")).setHeading();
		containerEl.createEl("p", {
			text:
				t("键位都在上面的「键位映射」里改。默认：P/H/E/S/L/A/R/O/G 切工具、1–9 快选调色板色、Ctrl+Z 撤销、Ctrl+Shift+Z 重做、Esc 退出绘制模式；按住 F（可改）= 临时橡皮，松开回到原来那支笔。"),
		});
	}

	/** Text input that records the next key press instead of typing text. */
	private keyRow(
		parent: HTMLElement,
		name: string,
		desc: string,
		spec: string,
		onCommit: (spec: string) => void,
		extra?: (setting: Setting) => void,
	): HTMLInputElement {
		const setting = new Setting(parent).setName(name);
		if (desc) setting.setDesc(desc);
		let elRef!: HTMLInputElement;
		setting.addText((text) => {
			elRef = text.inputEl;
			text.setPlaceholder(t("未绑定"));
			text.setValue(formatKeySpec(spec));
		});
		// `addText` builds the input synchronously, so this is assigned by now;
		// the guard is only here for a future Obsidian that defers it.
		const el = elRef;
		if (!el) throw new Error("keyRow: input missing");
		extra?.(setting);
		el.readOnly = true;
		el.addClass("pdf-ink-key");
		el.addEventListener("focus", () => el.addClass("pdf-ink-key-recording"));
		el.addEventListener("blur", () => el.removeClass("pdf-ink-key-recording"));
		el.addEventListener("keydown", (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (event.key === "Escape") {
				onCommit("");
				return;
			}
			const next = specFromEvent(event);
			if (!next) return;
			onCommit(next);
		});
		return el;
	}

	private renderTempEraser(containerEl: HTMLElement): void {
		const settings = this.plugin.settings;
		this.keyRow(
			containerEl,
			t("按住 = 临时橡皮"),
			t("按住这个键切到橡皮，松开立刻回到原来那支笔（原工具的橡皮参数不受影响）。留空关闭。"),
			settings.tempEraserKey,
			(spec) => {
				void (async () => {
					settings.tempEraserKey = normalizeSpec(spec);
					await this.plugin.saveSettings();
					this.display();
				})();
			},
		);
		new Setting(containerEl)
			.setName(t("侧键被识别成鼠标右键 / 中键"))
			.setDesc(
				t("有的驱动把笔侧键映射成鼠标按键而不是键盘。选对了就把「按住侧键时落笔」当作临时橡皮。先用「导出诊断信息」看日志里 btn= 的值再确定。"),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						off: t("不用（默认）"),
						right: t("右键（button=2）"),
						middle: t("中键（button=1）"),
					})
					.setValue(settings.tempEraserMouse)
					.onChange(async (value) => {
						settings.tempEraserMouse = value as PdfInkSettings["tempEraserMouse"];
						await this.plugin.saveSettings();
					}),
			);
	}

	private async commitBinding(id: string, spec: string): Promise<void> {
		const normalized = normalizeSpec(spec);
		const defaults = resolveBindings(undefined);
		const next = { ...this.plugin.settings.keyBindings };
		if (normalized && normalized === normalizeSpec(defaults[id] ?? "")) {
			// Back to the shipped default: drop the override so future default
			// changes still reach this action.
			delete next[id];
		} else {
			next[id] = normalized;
		}
		this.plugin.settings.keyBindings = next;
		await this.plugin.saveSettings();
		this.display();
	}

	private markConflicts(
		inputs: Array<{ id: string; el: HTMLInputElement }>,
		bindings: Record<string, string>,
	): void {
		const conflicts = findConflicts(bindings);
		for (const entry of inputs) {
			const spec = normalizeSpec(bindings[entry.id] ?? "");
			const ids = spec ? conflicts[spec] : undefined;
			if (ids && ids.length > 1) {
				entry.el.addClass("pdf-ink-key-conflict");
				const names = ids
					.filter((id) => id !== entry.id)
					.map((id) => {
						const action = ACTIONS.find((candidate) => candidate.id === id);
						return action ? t(action.name) : id;
					})
					.join("、");
				entry.el.setAttr("title", t("重复绑定：{names}", { names }));
			}
		}
	}
}
