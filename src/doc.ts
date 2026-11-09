import type { InkDoc, Layer, ShapeKind, Stroke, StrokeKind } from "./types";
import { clamp, isFiniteNumber, uid } from "./util";

export const DOC_VERSION = 1;

/** Polygons are capped so a broken sidecar cannot blow up the canvas. */
const MAX_POLYGON_VALUES = 3 * 64;

const KINDS: StrokeKind[] = [
	"pen",
	"highlighter",
	"eraser",
	"eraser-rect",
	"eraser-lasso",
	"line",
	"arrow",
	"rect",
	"ellipse",
	"polygon",
];

export function isShapeKind(kind: StrokeKind): kind is ShapeKind {
	return (
		kind === "line" ||
		kind === "arrow" ||
		kind === "rect" ||
		kind === "ellipse" ||
		kind === "polygon"
	);
}

export function createLayer(name: string): Layer {
	return {
		id: uid("l"),
		name,
		visible: true,
		locked: false,
		opacity: 1,
		strokes: [],
	};
}

export function createDoc(filePath: string): InkDoc {
	const layer = createLayer("图层 1");
	return {
		version: DOC_VERSION,
		file: filePath,
		layers: [layer],
		activeLayerId: layer.id,
		updated: Date.now(),
	};
}

export function findLayer(doc: InkDoc, id: string | null): Layer | null {
	if (!id) return null;
	return doc.layers.find((layer) => layer.id === id) ?? null;
}

export function getActiveLayer(doc: InkDoc): Layer | null {
	const layer = findLayer(doc, doc.activeLayerId);
	if (layer) return layer;
	const fallback = doc.layers[doc.layers.length - 1] ?? null;
	if (fallback) doc.activeLayerId = fallback.id;
	return fallback;
}

function sanitizeRings(raw: unknown): number[][] | null {
	if (!Array.isArray(raw) || raw.length === 0) return null;
	const rings: number[][] = [];
	for (const ringRaw of raw) {
		if (!Array.isArray(ringRaw)) return null;
		const ring: number[] = [];
		for (const value of ringRaw) {
			if (!isFiniteNumber(value)) return null;
			ring.push(value);
		}
		if (ring.length % 2 !== 0 || ring.length < 6) continue;
		rings.push(ring);
	}
	return rings.length > 0 ? rings : null;
}

function toKind(raw: unknown): StrokeKind {
	return typeof raw === "string" && (KINDS as string[]).includes(raw)
		? (raw as StrokeKind)
		: "pen";
}

function sanitizeStroke(raw: unknown, pageFallback: number): Stroke | null {
	if (!raw || typeof raw !== "object") return null;
	const value = raw as Record<string, unknown>;
	const pointsRaw = value.points;
	const rings = sanitizeRings(value.rings);
	if (!Array.isArray(pointsRaw) && !rings) return null;

	const points: number[] = [];
	if (Array.isArray(pointsRaw)) {
		for (const entry of pointsRaw) {
			if (!isFiniteNumber(entry)) return null;
			points.push(entry);
		}
		// Points are stored as x/y/pressure triples; reject broken data instead of
		// silently shifting every coordinate.
		if (points.length % 3 !== 0 || points.length < 3) return null;
	}
	if (rings && points.length === 0) {
		// outline-only stroke: the point checks below do not apply
	} else if (!Array.isArray(pointsRaw)) {
		return null;
	}

	const kind = toKind(value.kind ?? value.tool);
	if (rings) {
		// rings carry their own geometry; nothing to truncate
	} else if (kind === "polygon") {
		if (points.length < 9) return null;
		if (points.length > MAX_POLYGON_VALUES) points.length = MAX_POLYGON_VALUES;
	} else if (isShapeKind(kind) || kind === "eraser-rect") {
		if (points.length < 6) return null;
		points.length = 6;
	}

	const page =
		isFiniteNumber(value.page) && value.page >= 1 ? Math.floor(value.page) : pageFallback;
	const color = typeof value.color === "string" && value.color ? value.color : "#1e1e1e";
	const width = isFiniteNumber(value.width) && value.width > 0 ? value.width : 0.003;
	const opacity = isFiniteNumber(value.opacity) ? clamp(value.opacity, 0, 1) : 1;

	return {
		id: typeof value.id === "string" && value.id ? value.id : uid("s"),
		kind,
		page,
		color,
		width,
		opacity,
		points,
		...(value.fill === true ? { fill: true } : {}),
		...(rings ? { rings } : {}),
	};
}

/**
 * Tolerant parser for annotation sidecar files. Unknown or broken fields are
 * dropped instead of making the whole document unreadable.
 */
export function normalizeDoc(raw: unknown, filePath: string): InkDoc {
	const doc = createDoc(filePath);
	if (!raw || typeof raw !== "object") return doc;
	const value = raw as Record<string, unknown>;

	const layersRaw = value.layers;
	if (Array.isArray(layersRaw)) {
		const layers: Layer[] = [];
		for (const layerRaw of layersRaw) {
			if (!layerRaw || typeof layerRaw !== "object") continue;
			const layerValue = layerRaw as Record<string, unknown>;
			const layer: Layer = {
				id:
					typeof layerValue.id === "string" && layerValue.id
						? layerValue.id
						: uid("l"),
				name:
					typeof layerValue.name === "string" && layerValue.name
						? layerValue.name
						: `图层 ${layers.length + 1}`,
				visible: layerValue.visible !== false,
				locked: layerValue.locked === true,
				opacity: isFiniteNumber(layerValue.opacity)
					? clamp(layerValue.opacity, 0, 1)
					: 1,
				strokes: [],
			};
			if (Array.isArray(layerValue.strokes)) {
				for (const strokeRaw of layerValue.strokes) {
					const stroke = sanitizeStroke(strokeRaw, 1);
					if (stroke) layer.strokes.push(stroke);
				}
			}
			layers.push(layer);
		}
		if (layers.length > 0) doc.layers = layers;
	}

	const activeId = typeof value.activeLayerId === "string" ? value.activeLayerId : null;
	doc.activeLayerId =
		findLayer(doc, activeId)?.id ?? doc.layers[doc.layers.length - 1]?.id ?? null;
	doc.updated = isFiniteNumber(value.updated) ? value.updated : Date.now();
	return doc;
}
