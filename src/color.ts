/** Small color helpers for the in-panel color editor (no native dialogs). */

export interface Hsl {
	/** 0–360 */
	h: number;
	/** 0–100 */
	s: number;
	/** 0–100 */
	l: number;
}

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

function parseHex(hex: string): [number, number, number] | null {
	const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
	if (!match) return null;
	let body = match[1];
	if (body.length === 3) {
		body = body
			.split("")
			.map((char) => char + char)
			.join("");
	}
	return [
		parseInt(body.slice(0, 2), 16) / 255,
		parseInt(body.slice(2, 4), 16) / 255,
		parseInt(body.slice(4, 6), 16) / 255,
	];
}

export function hexToHsl(hex: string): Hsl {
	const rgb = parseHex(hex);
	if (!rgb) return { h: 0, s: 0, l: 0 };
	const [r, g, b] = rgb;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h: number;
	if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
	else if (max === g) h = ((b - r) / d + 2) / 6;
	else h = ((r - g) / d + 4) / 6;
	return {
		h: Math.round(h * 360),
		s: Math.round(s * 100),
		l: Math.round(l * 100),
	};
}

export function hslToHex(h: number, s: number, l: number): string {
	const hue = (((h % 360) + 360) % 360) / 360;
	const sat = clamp01(s / 100);
	const light = clamp01(l / 100);
	if (sat === 0) {
		const value = Math.round(light * 255);
		return `#${value.toString(16).padStart(2, "0").repeat(3)}`;
	}
	const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
	const p = 2 * light - q;
	const channel = (t: number): number => {
		let value = t;
		if (value < 0) value += 1;
		if (value > 1) value -= 1;
		if (value < 1 / 6) return p + (q - p) * 6 * value;
		if (value < 1 / 2) return q;
		if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
		return p;
	};
	const toHex = (value: number): string =>
		Math.round(clamp01(value) * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${toHex(channel(hue + 1 / 3))}${toHex(channel(hue))}${toHex(channel(hue - 1 / 3))}`;
}

/** Accepts `#abc`, `#aabbcc`, `aabbcc`; returns a normalized `#aabbcc` or null. */
export function normalizeHex(input: string): string | null {
	const rgb = parseHex(input);
	if (!rgb) return null;
	return `#${rgb
		.map((value) =>
			Math.round(clamp01(value) * 255)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}
