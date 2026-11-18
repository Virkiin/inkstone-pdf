/**
 * Input smoothing for the pen.
 *
 * The standard approach for stylus input is the One-Euro filter (Casiez et al.):
 * a low-pass whose cutoff rises with the speed of the pen, so slow strokes are
 * smoothed heavily (where jitter is visible) and fast strokes pass almost
 * untouched (where any lag would be felt). Values are page pixels and seconds.
 *
 * The filter is deliberately small and stateful: one instance per stroke,
 * discarded when the pen lifts.
 */

export type JitterFilter = "off" | "light" | "medium";

interface Preset {
	/** cutoff at zero speed, Hz — lower means smoother */
	minCutoff: number;
	/** how much speed raises the cutoff, per pixel per second */
	beta: number;
	/** cutoff of the derivative filter, Hz */
	dCutoff: number;
}

export const JITTER_PRESETS: Record<Exclude<JitterFilter, "off">, Preset> = {
	// Barely visible on handwriting, but takes the tremor out of resting strokes.
	light: { minCutoff: 1.5, beta: 0.03, dCutoff: 1 },
	// Noticeably calmer lines; a little lag is felt on very fast strokes.
	medium: { minCutoff: 0.9, beta: 0.02, dCutoff: 1 },
};

function alpha(cutoff: number, dt: number): number {
	const tau = 1 / (2 * Math.PI * cutoff);
	return 1 / (1 + tau / dt);
}

export class OneEuroFilter {
	private readonly preset: Preset;
	private lastTime = 0;
	private hasSample = false;
	private x = 0;
	private y = 0;
	private dx = 0;
	private dy = 0;
	/** the last unfiltered sample, so a stroke can end exactly where the pen was */
	private rawX = 0;
	private rawY = 0;

	constructor(preset: Preset) {
		this.preset = preset;
	}

	/** The pen went down: forget everything from the previous stroke. */
	reset(): void {
		this.hasSample = false;
		this.dx = 0;
		this.dy = 0;
	}

	get raw(): [number, number] {
		return [this.rawX, this.rawY];
	}

	/**
	 * Filters one sample. `time` is in seconds and must not go backwards; the
	 * first sample after a reset is returned unchanged so the stroke starts
	 * exactly where the pen landed.
	 */
	filter(x: number, y: number, time: number): [number, number] {
		this.rawX = x;
		this.rawY = y;
		if (!this.hasSample) {
			this.hasSample = true;
			this.lastTime = time;
			this.x = x;
			this.y = y;
			return [x, y];
		}
		const dt = Math.min(0.1, Math.max(1 / 240, time - this.lastTime));
		this.lastTime = Math.max(this.lastTime, time);

		const dxRaw = (x - this.x) / dt;
		const dyRaw = (y - this.y) / dt;
		const dAlpha = alpha(this.preset.dCutoff, dt);
		this.dx += dAlpha * (dxRaw - this.dx);
		this.dy += dAlpha * (dyRaw - this.dy);

		const cutoff = this.preset.minCutoff + this.preset.beta * Math.hypot(this.dx, this.dy);
		const a = alpha(cutoff, dt);
		this.x += a * (x - this.x);
		this.y += a * (y - this.y);
		return [this.x, this.y];
	}
}

/** One filter per stroke, or null when the user turned smoothing off. */
export function createJitterFilter(kind: JitterFilter): OneEuroFilter | null {
	if (kind === "off") return null;
	const preset = JITTER_PRESETS[kind];
	return preset ? new OneEuroFilter(preset) : null;
}
