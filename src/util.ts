/** Width reference: an A4 page rendered at 96 dpi (816 css px). */
export const REFERENCE_PAGE_WIDTH = 816;

export function uid(prefix: string): string {
	return (
		prefix +
		"-" +
		Date.now().toString(36) +
		"-" +
		Math.random().toString(36).slice(2, 9)
	);
}

export function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return value < min ? min : value > max ? max : value;
}

export function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** Round a normalized coordinate to 5 decimals, keeps the JSON small. */
export function roundCoord(value: number): number {
	return Math.round(value * 100000) / 100000;
}
