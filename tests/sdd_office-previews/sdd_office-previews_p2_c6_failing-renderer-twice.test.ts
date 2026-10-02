import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";
import { RECONCILE_DELAY_MS } from "../../src/features/office-previews/office-previews-engine";

describe("SDD office-previews p2 c6", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("calls a failing renderer once across two reconcile passes and queues nothing in the second", async () => {
		h = createHarness();
		h.renderer.failWith("exit");
		h.addSource("Docs/Angebot.docx");

		// First reconcile: the source is queued, rendered once, and the failure is recorded.
		await h.start();
		expect(h.renderer.calls).toHaveLength(1);
		expect(h.previewMarker("Docs/Angebot.docx")?.placeholder).toBe(true); // placeholder since 2026-10-02
		expect(await h.status()).toEqual({ current: 0, queued: 0, failed: 1 });

		// Second reconcile pass (toggle off and on schedules a new reconcile after 120 s).
		h.setEnabled(false);
		h.setEnabled(true);
		await h.advance(RECONCILE_DELAY_MS);
		await h.settle();

		// Failure memory: the unchanged source is not queued again.
		expect(await h.status()).toEqual({ current: 0, queued: 0, failed: 1 });

		await h.drain();
		expect(h.renderer.calls).toHaveLength(1);
		expect(h.previewMarker("Docs/Angebot.docx")?.placeholder).toBe(true);
	});
});
