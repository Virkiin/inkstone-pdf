import { clamp } from "../util";

export interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

function overlapArea(a: Box, b: Box): number {
	const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
	const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
	return width > 0 && height > 0 ? width * height : 0;
}

/**
 * Positions a `position: fixed` element next to `anchor`: tries right, left,
 * below and above, clamps every candidate into the viewport, and prefers the
 * one that covers the fewest `avoid` rectangles (the toolbar, usually).
 * Must be called after the element is attached and has a measurable size.
 */
export function placeFloating(
	el: HTMLElement,
	anchor: HTMLElement,
	options: { gap?: number; avoid?: Box[]; margin?: number } = {},
): void {
	const gap = options.gap ?? 6;
	const margin = options.margin ?? 8;
	const anchorRect = anchor.getBoundingClientRect();
	const rect = el.getBoundingClientRect();
	const candidates = [
		{ left: anchorRect.right + gap, top: anchorRect.top },
		{ left: anchorRect.left - gap - rect.width, top: anchorRect.top },
		{ left: anchorRect.left, top: anchorRect.bottom + gap },
		{ left: anchorRect.left, top: anchorRect.top - gap - rect.height },
	];

	let best = { left: candidates[0].left, top: candidates[0].top };
	let bestScore = Number.NEGATIVE_INFINITY;
	for (const candidate of candidates) {
		const left = clamp(
			candidate.left,
			margin,
			Math.max(margin, window.innerWidth - rect.width - margin),
		);
		const top = clamp(
			candidate.top,
			margin,
			Math.max(margin, window.innerHeight - rect.height - margin),
		);
		const box: Box = {
			left,
			top,
			right: left + rect.width,
			bottom: top + rect.height,
		};
		let overlap = 0;
		for (const avoid of options.avoid ?? []) overlap += overlapArea(box, avoid);
		// Prefer a spot that did not have to be moved, then the least overlap.
		const shifted = Math.abs(left - candidate.left) + Math.abs(top - candidate.top);
		const score = -overlap * 4 - shifted;
		if (score > bestScore) {
			bestScore = score;
			best = { left, top };
		}
	}
	el.style.left = `${Math.round(best.left)}px`;
	el.style.top = `${Math.round(best.top)}px`;
}

/** `getBoundingClientRect()` as a plain box, for `placeFloating`. */
export function boxOf(element: Element): Box {
	const rect = element.getBoundingClientRect();
	return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}
