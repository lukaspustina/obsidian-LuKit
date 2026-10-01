import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";
import { PreviewQueue } from "../../src/features/office-previews/preview-queue";
import {
	JITTER_MAX_MS,
	JITTER_MIN_MS,
	MODIFY_DEBOUNCE_MS,
} from "../../src/features/office-previews/office-previews-engine";

describe("SDD office-previews p2 c4", () => {
	describe("feature: three due jobs", () => {
		let h: Harness;

		beforeEach(async () => {
			h = createHarness();
			// Listeners exist only after layout ready (requirement 33); run the empty startup reconcile first.
			await h.start();
		});

		afterEach(() => {
			h.dispose();
		});

		it("never has more than one render in flight while three jobs are due", async () => {
			h.renderer.hold();
			h.createSource("a.docx");
			h.createSource("b.xlsx");
			h.createSource("c.pptx");

			// Debounce plus the maximum jitter: all three jobs are due now.
			await h.advance(MODIFY_DEBOUNCE_MS + JITTER_MAX_MS);
			expect(h.renderer.calls).toHaveLength(1);
			expect(h.renderer.inFlight).toBe(1);

			h.renderer.release();
			await h.settle();
			expect(h.renderer.calls).toHaveLength(2);
			expect(h.renderer.inFlight).toBe(1);

			h.renderer.release();
			await h.settle();
			expect(h.renderer.calls).toHaveLength(3);
			expect(h.renderer.inFlight).toBe(1);

			h.renderer.release();
			await h.settle();
			expect(h.renderer.inFlight).toBe(0);
			expect(h.renderer.maxInFlight).toBe(1);
		});

		it("renders all three sources eventually, one after the other", async () => {
			h.renderer.hold();
			h.createSource("a.docx");
			h.createSource("b.xlsx");
			h.createSource("c.pptx");
			await h.advance(MODIFY_DEBOUNCE_MS + JITTER_MAX_MS);

			for (let i = 0; i < 3; i++) {
				await h.settle();
				h.renderer.release();
				await h.settle();
			}

			expect([...h.renderer.renderedPaths()].sort()).toEqual(["a.docx", "b.xlsx", "c.pptx"]);
			expect(h.renderer.maxInFlight).toBe(1);
			expect(h.preview("a.docx")).toBeDefined();
			expect(h.preview("b.xlsx")).toBeDefined();
			expect(h.preview("c.pptx")).toBeDefined();
		});
	});

	describe("queue: a path enqueued twice", () => {
		beforeEach(() => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		function makeQueue(): { queue: PreviewQueue; run: ReturnType<typeof vi.fn> } {
			const run = vi.fn(async (_path: string): Promise<void> => undefined);
			const queue = new PreviewQueue({
				random: () => 0,
				setTimeout: (fn, ms) => setTimeout(fn, ms),
				clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
				recheck: async () => "render",
				run,
			});
			return { queue, run };
		}

		it("keeps one job for a duplicate path", () => {
			const { queue } = makeQueue();
			queue.enqueue("a.docx");
			queue.enqueue("a.docx");
			expect(queue.length).toBe(1);
			expect(queue.has("a.docx")).toBe(true);
		});

		it("restarts the delay on the second enqueue and runs the job once", async () => {
			const { queue, run } = makeQueue();
			queue.enqueue("a.docx");

			await vi.advanceTimersByTimeAsync(20_000);
			queue.enqueue("a.docx");
			expect(queue.length).toBe(1);

			// Original delay (30 s with random() = 0) would have expired by now.
			await vi.advanceTimersByTimeAsync(JITTER_MIN_MS - 20_000 + 1);
			expect(run).not.toHaveBeenCalled();

			// Restarted delay: 20 s + 30 s after the first enqueue.
			await vi.advanceTimersByTimeAsync(20_000);
			expect(run).toHaveBeenCalledTimes(1);
			expect(run).toHaveBeenCalledWith("a.docx");
			expect(queue.length).toBe(0);
		});
	});
});
