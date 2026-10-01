import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";
import {
	JITTER_MAX_MS,
	JITTER_MIN_MS,
	MODIFY_DEBOUNCE_MS,
} from "../../src/features/office-previews/office-previews-engine";

const SOURCE = "Projekte/Angebot.docx";
const STEP_MS = 500;

describe("SDD office-previews p2 c2", () => {
	let h: Harness | undefined;

	afterEach(() => {
		h?.dispose();
		h = undefined;
	});

	// The job is queued once the per-path debounce has elapsed; the jitter starts then.
	// Returns the elapsed time since the create event at which the renderer was first called.
	async function renderTimeAfterCreate(seed: number): Promise<number> {
		h = createHarness({ seed });
		// Run the (empty) startup reconcile first so it cannot interfere with the measured job.
		await h.start();
		const startedAt = Date.now();
		h.createSource(SOURCE);
		const limit = MODIFY_DEBOUNCE_MS + JITTER_MAX_MS + 10_000;
		for (let elapsed = 0; elapsed <= limit; elapsed += STEP_MS) {
			await h.advance(STEP_MS);
			if (h.renderer.calls.length > 0) return Date.now() - startedAt;
		}
		return Number.POSITIVE_INFINITY;
	}

	it("does not render before the minimum jitter has passed after queueing", async () => {
		h = createHarness({ seed: 7 });
		await h.start();
		h.createSource(SOURCE);
		await h.advance(MODIFY_DEBOUNCE_MS + JITTER_MIN_MS - 1);
		await h.settle();
		expect(h.renderer.calls).toHaveLength(0);
	});

	it("has rendered by the time the maximum jitter has passed after queueing", async () => {
		h = createHarness({ seed: 7 });
		await h.start();
		h.createSource(SOURCE);
		await h.advance(MODIFY_DEBOUNCE_MS + JITTER_MAX_MS);
		await h.settle();
		expect(h.renderer.renderedPaths()).toEqual([SOURCE]);
		expect(h.previewMarker(SOURCE)).not.toBeNull();
	});

	it.each([1, 2, 3, 5, 8, 13, 21, 42])("renders within [30 s, 120 s] after queueing for seed %i", async (seed) => {
		const elapsed = await renderTimeAfterCreate(seed);
		expect(elapsed).toBeGreaterThanOrEqual(MODIFY_DEBOUNCE_MS + JITTER_MIN_MS);
		// Allow one polling step of slack for the measurement granularity.
		expect(elapsed).toBeLessThanOrEqual(MODIFY_DEBOUNCE_MS + JITTER_MAX_MS + STEP_MS);
	});
});
