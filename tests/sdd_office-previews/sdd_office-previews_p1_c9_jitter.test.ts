import { describe, it, expect } from "vitest";
import {
	JITTER_MIN_MS,
	JITTER_MAX_MS,
	jitterMs,
} from "../../src/features/office-previews/office-previews-engine";

describe("SDD office-previews p1 c9 jitter", () => {
	it("exposes the jitter window constants", () => {
		expect(JITTER_MIN_MS).toBe(30_000);
		expect(JITTER_MAX_MS).toBe(120_000);
	});

	it("returns the minimum for random() of 0", () => {
		expect(jitterMs(() => 0)).toBe(30_000);
	});

	it("stays within the window for random() just below 1", () => {
		const value = jitterMs(() => 1 - Number.EPSILON);
		expect(value).toBeLessThanOrEqual(120_000);
		expect(value).toBeGreaterThanOrEqual(30_000);
		expect(value).toBe(120_000);
	});

	it("returns integers inside [30_000, 120_000] for sampled inputs", () => {
		for (const r of [0, 0.1, 0.25, 0.5, 0.75, 0.999, 1 - Number.EPSILON]) {
			const value = jitterMs(() => r);
			expect(Number.isInteger(value)).toBe(true);
			expect(value).toBeGreaterThanOrEqual(JITTER_MIN_MS);
			expect(value).toBeLessThanOrEqual(JITTER_MAX_MS);
		}
	});

	it("follows the SDD formula at the midpoint", () => {
		const expected = JITTER_MIN_MS + Math.floor(0.5 * (JITTER_MAX_MS - JITTER_MIN_MS + 1));
		expect(jitterMs(() => 0.5)).toBe(expected);
	});
});
