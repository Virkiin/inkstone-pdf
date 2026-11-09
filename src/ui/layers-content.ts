import { Notice, setIcon, setTooltip } from "obsidian";
import type { PdfInkController } from "../controller";
import type PdfInkPlugin from "../main";
import type { Layer } from "../types";
import { ConfirmModal } from "./confirm";

/**
 * The layers list, shared by the sidebar view and the floating popover so both
 * look and behave identically.
 */

function el(doc: Document, tag: string, className?: string, text?: string): HTMLElement {
	const node = doc.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

function iconButton(
	parent: HTMLElement,
	icon: string,
	label: string,
	onClick: () => void,
): HTMLButtonElement {
	const button = el(parent.ownerDocument, "button", "pdf-ink-icon-btn") as HTMLButtonElement;
	button.type = "button";
	button.setAttribute("aria-label", label);
	setIcon(button, icon);
	setTooltip(button, label);
	button.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		onClick();
	});
	parent.appendChild(button);
	return button;
}

export function renderLayersInto(container: HTMLElement, plugin: PdfInkPlugin): void {
	const doc = container.ownerDocument;
	while (container.firstChild) container.removeChild(container.firstChild);

	const controller = plugin.getTargetController();
	const ink = controller?.doc ?? null;

	const header = el(doc, "div", "pdf-ink-layers-header");
	const titleWrap = el(doc, "div", "pdf-ink-layers-title-wrap");
	const title = el(
		doc,
		"div",
		"pdf-ink-layers-title",
		controller?.filePath?.split("/").pop() ?? "PDF 墨迹",
	);
	const subtitle = el(
		doc,
		"div",
		"pdf-ink-layers-subtitle",
		ink ? `${ink.layers.length} 个图层` : "尚未打开 PDF",
	);
	titleWrap.append(title, subtitle);
	header.appendChild(titleWrap);
	iconButton(header, "plus", "新建图层", () => {
		if (!controller) {
			new Notice("[PDF Ink] 请先打开一个 PDF 文件");
			return;
		}
		controller.addLayer();
	});
	container.appendChild(header);

	if (!controller || !ink) {
		container.appendChild(
			el(
				doc,
				"div",
				"pdf-ink-layers-empty",
				"打开一个 PDF，点击铅笔（或命令「PDF Ink: 开启/关闭绘制模式」）即可开始批注。笔迹会按图层保存。",
			),
		);
		return;
	}

	const list = el(doc, "div", "pdf-ink-layer-list");
	for (const layer of [...ink.layers].reverse()) {
		list.appendChild(renderLayerRow(doc, layer, controller, ink.activeLayerId, plugin, container));
	}
	container.appendChild(list);

	const active = ink.layers.find((layer) => layer.id === ink.activeLayerId);
	if (active) container.appendChild(renderOpacity(doc, active, controller));

	container.appendChild(
		el(
			doc,
			"div",
			"pdf-ink-layers-hint",
			"列表从上到下即绘制层级（上方覆盖下方）。双击图层名可重命名。",
		),
	);
}

function renderLayerRow(
	doc: Document,
	layer: Layer,
	controller: PdfInkController,
	activeLayerId: string | null,
	plugin: PdfInkPlugin,
	root: HTMLElement,
): HTMLElement {
	const row = el(doc, "div", "pdf-ink-layer-row");
	row.dataset.layerId = layer.id;
	row.classList.toggle("is-active", layer.id === activeLayerId);
	row.classList.toggle("is-hidden", !layer.visible);
	row.addEventListener("click", () => controller.setActiveLayer(layer.id));

	iconButton(row, layer.visible ? "eye" : "eye-off", layer.visible ? "隐藏图层" : "显示图层", () =>
		controller.setLayerVisible(layer.id, !layer.visible),
	);
	iconButton(row, layer.locked ? "lock" : "unlock", layer.locked ? "解锁图层" : "锁定图层", () =>
		controller.setLayerLocked(layer.id, !layer.locked),
	);

	const name = el(doc, "div", "pdf-ink-layer-name", layer.name);
	name.addEventListener("dblclick", (event) => {
		event.stopPropagation();
		startRename(doc, name, layer, controller, plugin, root);
	});
	row.appendChild(name);

	const actions = el(doc, "div", "pdf-ink-layer-actions");
	iconButton(actions, "chevron-up", "上移一层", () => controller.moveLayer(layer.id, 1));
	iconButton(actions, "chevron-down", "下移一层", () => controller.moveLayer(layer.id, -1));
	iconButton(actions, "trash-2", "删除图层", () => {
		new ConfirmModal(
			plugin.app,
			"删除图层",
			`确定删除「${layer.name}」吗？`,
			"删除",
			() => controller.deleteLayer(layer.id),
		).open();
	});
	row.appendChild(actions);

	return row;
}

function renderOpacity(
	doc: Document,
	layer: Layer,
	controller: PdfInkController,
): HTMLElement {
	const wrap = el(doc, "div", "pdf-ink-layers-opacity");
	wrap.appendChild(el(doc, "span", "pdf-ink-layers-opacity-label", "不透明度"));
	const input = el(doc, "input", "pdf-ink-layers-opacity-input") as HTMLInputElement;
	input.type = "range";
	input.min = "10";
	input.max = "100";
	input.step = "5";
	input.value = String(Math.round(layer.opacity * 100));
	const value = el(doc, "span", "pdf-ink-layers-opacity-value", `${input.value}%`);
	input.addEventListener("input", () => {
		value.textContent = `${input.value}%`;
	});
	input.addEventListener("change", () => {
		controller.setLayerOpacity(layer.id, Number(input.value) / 100);
	});
	wrap.append(input, value);
	return wrap;
}

function startRename(
	doc: Document,
	nameEl: HTMLElement,
	layer: Layer,
	controller: PdfInkController,
	plugin: PdfInkPlugin,
	root: HTMLElement,
): void {
	const input = doc.createElement("input");
	input.className = "pdf-ink-layer-rename";
	input.value = layer.name;
	nameEl.textContent = "";
	nameEl.appendChild(input);
	input.focus();
	input.select();
	const commit = () => {
		controller.renameLayer(layer.id, input.value);
		renderLayersInto(root, plugin);
	};
	input.addEventListener("blur", commit, { once: true });
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			input.blur();
		} else if (event.key === "Escape") {
			event.preventDefault();
			input.value = layer.name;
			input.blur();
		}
	});
}
