# Changelog

## 0.1.5

拖拽工具下的 Shift 手势按实际使用手感重做：方向判断更稳，上下拖动可以快速翻页。

- 方向判定：要移动超过 18 像素、且一个方向比另一个方向明显占优（1.25 倍）才锁定，斜着拖不会误判成缩放；锁定后整段拖动都保持同一模式。
- 上下拖动改为"快速翻页"：位移按灵敏度放大，默认 5 倍、最高 10 倍（原来与普通拖拽完全相同，等于没效果）。
- 灵敏度滑块从 1–5 档扩到 1–10 档，默认 5；这一档同时决定缩放速度与翻页倍数。

English: the Shift gesture on the hand tool is rebuilt around how it actually feels. A drag commits to an axis only after 18 px and only when one direction clearly leads the other (1.25x), so a slanted drag no longer turns into a zoom, and the chosen axis stays for the whole gesture. Up/down dragging now really scrolls fast: the travel is multiplied by the sensitivity setting — 5x by default, up to 10x — where before it was identical to a normal drag. The slider itself grew from five steps to ten, defaulting to five.

## 0.1.4

顶部栏开关、Shift 拖动手势、分屏修复与一批稳定性改动。

- 新增 PDF 顶部栏开关：每个 PDF 标签页的顶部栏多一个铅笔按钮。亮＝显示工具栏、正常批注；灭＝这个标签页回到普通 PDF 阅读器（不落笔、不改笔迹、不吃快捷键、工具栏收起），已经画好的批注仍然显示
- 拖拽工具手势调整：按住 `Shift` 左右拖动是缩放（向右放大、向左缩小），上下拖动快速翻页（默认约为普通拖动的 3 倍）；一次拖动只会进入其中一种，按第一次移动的方向决定
- 分屏修复：同时打开 PDF 和笔记时，点 PDF、在 PDF 上落笔不再把焦点和按键丢给旁边的笔记
- 笔模式（以及荧光笔、橡皮）下轻点 / 双击不再选中笔迹：轻点按正常落笔处理，画出一个点；选中笔迹请切到选择工具（选择工具里双击 / 长按弹菜单的行为不变）
- 关掉批注开关后光标立即恢复默认，笔刷圈与橡皮圆盘不再冒出来
- 修复重启后自动恢复的后台 PDF 标签页没有顶部按钮、也不加载批注的问题
- 启动更轻：布局事件先合并再扫描，减少开机时对上百页文档的重复遍历
- 修正声明的 Obsidian 最低版本：代码用到 1.8.7 才有的 `getLanguage()`，而 manifest 原写 1.8.0，社区插件的自动检查报 `obsidianmd/no-unsupported-api` 未通过；现改为 1.8.7

English: a per-tab switch in the PDF view header (on = toolbar and annotation; off = a plain reader, with the ink already on the page still visible); in the hand tool, `Shift` + sideways drag zooms (right in, left out) and `Shift` + up/down drag pans the page quickly, and a single drag only ever does one of the two — the first direction that moves decides; split-view fix so clicks and keystrokes on the PDF are no longer stolen by the note next to it; a tap in pen mode now makes a dot instead of selecting a stroke; the pointer returns to normal as soon as the switch is off; PDF tabs restored in the background keep their button and load their ink; lighter startup, because layout events are coalesced before scanning the open PDFs; the declared minimum Obsidian version is now 1.8.7, because the plugin calls `getLanguage()`, which the automated review flagged as newer than the old 1.8.0 declaration.

## 0.1.3

界面中英双语、形状识别更快更准、画完还能改。

- 界面中英双语：设置里在「自动 / 中文 / English」之间切换，命令名、工具栏、笔刷面板、设置项全部跟随；预设名与图层名这类用户数据不翻译
- 形状识别更快：干净的长直线和规整的方框、圆约 160ms 落定，其余形状的默认停顿从 600ms 降到 350ms（设置里可调 150–1500ms）
- 方框不再被认成椭圆：改用「到包围盒四边的平均距离」判定，圆角方框、手抖方框都稳定出矩形
- 新增水平 / 垂直镜像：选中菜单一行两键，镜像轴取选区框自身；直线、箭头、多边形不可镜像（按钮置灰并说明原因）
- 直线和箭头可以改端点：单选时两端出现圆点手柄，拖动只改这一端，另一端钉住
- 输入抖动修正：关 / 轻 / 中三档 One-Euro 滤波，默认轻，抬笔时追加原始末点避免笔画缩短
- 橡皮修复：涂抹切分后只剩轮廓的碎片也能整笔擦掉；擦除后的重绘范围包含被删笔迹的包围盒，不再留残影
- Shift + 拖拽缩放改为 5 档线性变速（设置里 1–5，默认 3）
- Shift 调笔宽 / 不透明度加了每轴 3px 死区，两个方向不再互相串
- 新增卡死探针与擦除慢日志，方便定位偶发卡顿

English: bilingual UI (Auto / Chinese / English); faster shape recognition (about 160 ms for obvious shapes, 350 ms default, adjustable); boxes are no longer classified as ellipses; horizontal and vertical mirror in the selection menu for pen, highlighter, rectangle and ellipse; draggable endpoints for lines and arrows; input smoothing (off / light / medium); eraser fixes for fragments and ghost trails; 5-step Shift+drag zoom; 3 px dead zone on the brush-adjust gesture.

## 0.1.0（历史开发迭代，dev.16–dev.51）

- 按 [1.0 规格](docs/spec-v1.md) 实现 PDF 手写批注
- 文档级图层、压感、区域橡皮、形状工具、多色笔、自动保存

### 开发迭代

- dev.16：选择工具（矩形 / 套索选中 + 拖动移动）、橡皮 / 选择模式弹窗、纵向图层导航
- dev.17：毫秒级性能采样（输入 / 取矩形 / 增量绘制 / 帧间隔 / 提交 / 整页重绘 / 保存），采样随诊断信息写入 `debug.json`，新增「显示性能摘要」「清空性能采样」命令
- dev.18：按笔缓存取矩形、侧车压缩（2.35MB → 约 570KB）、书写中推迟落盘
- dev.19：压感擦除（先出墨后回滚，擦头随压力变宽，半透明白色实心圆指示）、橡皮整笔擦除 / 整笔删除、自动识别直线 / 矩形 / 椭圆 / 三角形与多边形（撤销回到手写）
- dev.20：长按擦除改 1 秒压力检测窗口、静止半径可调、识别改「停住即转换」、橡皮菜单分组、弹窗浮层防裁切
- dev.21：橡皮「区域 × 方式」两维、涂抹改为切开笔迹、模式菜单分组并避开工具栏
- dev.22：去掉点选择、整笔扫掠可从空白起手、落笔自动关闭弹窗、旧遮罩橡皮自动切分迁移（保留压感与箭头头）
- dev.23：选区随工具清除、箭头切分保留实心箭头头、文本层不再抢焦点与指针、实时与提交笔迹统一
- dev.24：图层面板改为工具栏浮层弹窗（侧边栏视图仍保留）、去掉图层笔迹计数
- dev.25：橡皮改按区域边界二分求交裁剪（断口紧贴橡皮）
- dev.26：橡皮改为「描边转轮廓 + 布尔差集」，粗笔画内部可挖洞、细笔自动切断（clipper2-ts）；笔迹新增 rings 轮廓模型与 evenodd 渲染
- dev.27：擦除保留压感粗细（带状轮廓）、形状按真实轮廓转换、实心多边形按面积处理、轮廓笔迹可拖动、选区只画外框
- dev.28：擦除痕迹保留压感宽度、修复并集绕向导致空心三角、急转弯补圆角、长按默认 750ms
- dev.29：箭头头不再加宽圆化、起笔压力钳制、识别定时器节流、擦除性能采样
- dev.30：选区复制 / 剪切 / 粘贴（Ctrl+C/X/V）、Delete 删除、全选；粘贴偏移 8px 并自动选中
- dev.31：笔尖双击 / 轻长按选中并弹出复制剪切粘贴菜单；粘贴落在当前页；Ctrl+A；性能时间线（长任务与提交点）
- dev.32：双击 / 轻按在任意工具（含橡皮）下选中并弹菜单、剪贴板跨标签页共享、keydown 捕获阶段
- dev.33：手势定稿：笔 = 长按、选择 = 双击 / 长按、橡皮无菜单；菜单随按下 / 换工具关闭；粘贴需先选中
- dev.34：钢笔画长按切到选择模式、粘贴跟随笔尖且无需选中、半透明笔迹恢复单路径绘制
- dev.35：选择模式选中即弹菜单、空按也弹；钢笔长按立即切选择模式；荧光笔默认不透明度 0.5
- dev.36：长按进入选择模式可直接框选、空白单击退回笔模式、双击空白才弹菜单、拖动后菜单跟随落点
- dev.37：选中框可整体拖动（命中区按虚线框放宽 10px）、菜单贴框边外沿不遮挡
- dev.38：笔刷面板（工具栏双击 / 长按笔刷按钮弹出：预设横排、可编辑调色板、粗细与不透明度滑块、真实笔迹预览、橡皮两种模式 + 三种区域）、可编辑调色板与常用色一行（单击切换 / 长按替换）、钢笔不透明度、移除工具栏粗细滑块；选区四角缩放与顶部圆点旋转（Shift 吸附 15°）、变换实时百分比 / 角度提示、旋转后的矩形椭圆烘焙为多边形、方向键微移（Shift 10px），一次变换一条撤销记录
- dev.39：修复「单击笔刷按钮 0.4 秒后面板自己弹出」（长按计时器没在指针抬起时取消，常用色的长按替换也有同样问题）；缩放改为 X / Y 独立比例（Shift 锁定等比），矩形在自由缩放下仍是矩形；句柄点击不再被双击手势吞掉；长任务时间线改用 `entry.startTime` 归因（观察器是批量延迟投递的），性能摘要补 `longtask` 总阻塞时长
- dev.40：修复三处实机问题——拖动选中笔迹时选中框不跟随（改为按笔迹重算包围盒）、旋转把柄的连线单位混用导致虚线一直画到页面顶部、橡皮的矩形/套索模式仍显示自由擦除的半透明圆光标（只有自由涂抹才显示）
- dev.41：选区改为**有向包围盒**——旋转时框保持尺寸不变、跟着手一起转（不再每帧重算成外接矩形），把柄始终贴在「靠上」的边上并在拖动中跟随；松手后再重新贴合笔迹；旋转后的矩形/椭圆在缩放时沿自身对角线伸缩（`R·S·R⁻¹`），不会被剪切；撤销/重做同时还原框的角度；选择菜单改为在框外四侧择优，避开旋转把柄
- dev.42：选中框四条边中点新增**单轴缩放点**（只改该方向的尺寸，另一端固定）；修复旋转把柄连接线继承了钢笔颜色的问题（画线前没重置 `strokeStyle`）；选择模式下隐藏常用色；工具栏的当前颜色改为**只读色块**，删除旧的调色板弹层（`pointer-events: none`，不影响拖拽工具栏）
- dev.43：边中点手柄锁死另一轴——抓点偏离中点几个像素时，纵向拖动不会再把高度按比例放大（集成测试故意抓偏 5px 覆盖）
- dev.51：基准测试补「逐帧绘制 + 呈现」（24 帧 rAF 间隔）与 WebGL 可用性探测。真机结果：画布操作本身 0.07–0.13ms，说明卡顿不在绘制调用，而在把帧呈现出去（合成/光栅）；同时产出可分发安装包 pdf-ink-0.1.0.zip（main.js + manifest.json + styles.css + 安装说明）
- dev.50：回退 dev.49 的「画布元素承载透明度」方案（实测 rame.gap p95 从 18ms 涨到 88ms，更慢——给画布设 opacity 会让它每帧整层重绘）。恢复恒定宽度笔迹的单路径重描，保留「只清上一笔包围盒」的改进；新增命令「画布基准测试（排查卡顿用）」，直接在真机上量出全页/区域 clear、300 段描边、区域 blit 的耗时并写入 debug.json
- dev.49：①半透明笔迹改为「画布元素承载透明度 + 段增量绘制」——原来恒定宽度的笔（荧光笔、无压感变化的粗笔）每帧都要整幅清空再重画整条路径，粗笔随面积线性变慢；现在笔迹按 alpha 1.0 逐段画进 live 画布，由画布元素的 CSS opacity 统一承载透明度，段与段不再叠加、也不必重描；②`beginLive` / `drawLive` 的清空改为只清上一笔的包围盒；③去掉 dev.44 加的 `contain: strict` 与 `will-change: transform`（针对「别的插件」的猜测，现已证明与本问题无关）；④拖拽工具在鼠标下可用（不再受「鼠标直接书写」开关限制）；⑤Alt + 选择工具时笔也能选中文字
- dev.48：画布像素预算做成设置项「墨迹清晰度 / 流畅度」（流畅 2.4 Mpx / 平衡 4 Mpx / 清晰 8 Mpx，默认流畅）。依据：把预算从 10 Mpx 降到 4 Mpx 后，长任务总时长从 25.6s 降到 10.8s（约 −58%），阻塞时间与画布面积成正比，即每次落笔后的纹理上传/重绘
- dev.47：①新增**拖拽工具**（工具栏手形按钮 / G），拖动即平移 PDF 视图，不碰笔迹；②**文本选择改成显式开启**：只有「选择工具 + Alt」才把文本层交还给文本选择（鼠标与笔一致），其他情况文本层一律 pointer-events: none；③光标规则挂到整个 .page（之前只挂画布，指针实际命中的是 pdf.js 自己的 canvas，所以看到的是默认箭头）；④画布后备存储加**像素预算上限**（4 Mpx），1326×1876@2x 从 ~10 Mpx 降到 ~4 Mpx，缓解每次绘制后的整纹理上传；⑤debug.json 的 overlay 增加 acking 尺寸
- dev.46：①落笔后只把笔迹包围盒从 live 画布 blit 到合成画布（原来每次提交整页 10 Mpx 拷贝 + 整页清空，JS 只花 0.18ms，但随后的重绘/上传是每条 ~85ms 长任务——时间线上它就紧跟在每次 commit 后面）；②细笔光标改用 PNG base64（Chromium 会静默丢弃 SVG 光标，所以之前根本没显示）；③粗笔圆环在书写过程中跟着指针走（笔画期间事件被拦截，原来的悬停监听收不到）；④调色板网格不再每次点击重建，双击色格才会真正触发；⑤长按非当前色的色格时先选中该色再打开取色器
- dev.45：①笔刷面板的调色板改成**自带取色器**（色相/饱和度/明度滑杆 + hex 输入，贴着色格弹出，长按或双击色格打开），不再调用原生对话框（它在 Electron 里总跑到窗口左上角）；②方案 C 光标：细笔（≤6px）用「小点 + 四段短臂」的 CSS 光标，粗笔/荧光笔用跟随笔宽的圆环，橡皮仍是半透明圆盘，选择/形状保留十字；③性能：PDF 文本层在笔优先模式下 pointer-events: none（Alt 恢复），不再把指针事件交给文本层类插件；④工具栏 update() 改为幂等（图标/常用色/图层名只在变化时重写），避免每次落笔都制造一轮 DOM 变更；⑤>100ms 长任务写入日志并标注是否发生在书写中
- dev.44：性能与兼容——①书写期间在 window 捕获阶段拦掉 mousedown/mouseup/click/dblclick（含 350ms 尾巴），其他插件看不到笔迹产生的兼容鼠标事件；②画布加 contain: strict，书写中给 live 画布 will-change: transform 独占合成层，重绘不外溢；③书写期间关闭 Editing Toolbar 的毛玻璃/过渡（ackdrop-filter 会在每个采样点被重新栅格化）；④debug.json 增加已启用插件列表，>120ms 的长任务写进日志；⑤笔刷面板的原生取色器改为贴着按下的色格弹出（原来停靠在 -9999px，对话框跑到窗口左上角）

## 0.0.1-prototype

- 技术验证原型：单层笔迹、笔用级橡皮、基础工具栏与图层面板
- 用于验证 Obsidian PDF 视图的 canvas 覆盖层方案
