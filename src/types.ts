export type ShapeKind = "line" | "arrow" | "rect" | "ellipse" | "polygon";
export type StrokeKind =
	| "pen"
	| "highlighter"
	| "eraser"
	| "eraser-rect"
	| "eraser-lasso"
	| ShapeKind;
export type ToolName = "pen" | "highlighter" | "eraser" | "select" | "hand" | ShapeKind;

/** How the eraser region is specified. */
export type EraserRegion = "free" | "rect" | "lasso";
/** Whether erasing cuts the stroke or removes it entirely. */
export type EraserScope = "partial" | "whole";

export interface Stroke {
	id: string;
	kind: StrokeKind;
	/** 1-based page number inside the PDF */
	page: number;
	color: string;
	/** stroke width as a fraction of the page width (resolution independent) */
	width: number;
	/** 0..1, multiplied with the layer opacity */
	opacity: number;
	/**
	 * Flat list of triples: x, y, pressure.
	 * x / y are normalized to the page box, i.e. both live in [0, 1].
	 * Shapes use exactly two points (start / end), pressure is ignored.
	 */
	points: number[];
	/** filled polygon (arrow head, or a stroke that has been erased into an outline) */
	fill?: boolean;
	/**
	 * Outline representation: flat [x0, y0, x1, y1, ...] rings in normalized
	 * page coordinates. Ring 0 is the outer contour, the rest are holes.
	 * When present the stroke is rendered as a filled shape.
	 */
	rings?: number[][];
}

export interface Layer {
	id: string;
	name: string;
	visible: boolean;
	locked: boolean;
	/** 0..1 */
	opacity: number;
	/** strokes of all pages that belong to this layer, in painting order */
	strokes: Stroke[];
}

export interface InkDoc {
	version: 1;
	/** vault path of the annotated PDF */
	file: string;
	/** painting order: index 0 is the bottom layer */
	layers: Layer[];
	activeLayerId: string | null;
	updated: number;
}
