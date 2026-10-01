import { afterEach, describe, expect, it } from "vitest";
import { createHarness, sha256Of, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p2 c19", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("stamps the pre-render fingerprint, re-renders once after the modify, then converges", async () => {
		h = createHarness();
		const src = "Projekte/Angebot.docx";
		const v1 = "content version one";
		const v2 = "content version two (changed during render)";
		h.addSource(src, v1);

		// Reconcile queues the source; hold the renderer so the render stays in flight.
		h.renderer.hold();
		h.layoutReady();
		await h.advance(120_000);
		for (let i = 0; i < 14 && h.renderer.held.length === 0; i++) {
			await h.advance(10_000);
		}
		expect(h.renderer.held.length).toBe(1);

		// The source is modified while its render is in flight.
		h.changeSource(src, v2);

		// Finish the first render.
		h.renderer.unhold();
		h.renderer.release();
		await h.settle();

		// The marker holds the fingerprint computed before the render, not the new one.
		expect(h.previewMarker(src)?.sha256).toBe(sha256Of(v1));

		// The queue drains: the modify event triggers exactly one more render.
		await h.drain();
		expect(h.renderer.calls.length).toBe(2);
		expect(h.previewMarker(src)?.sha256).toBe(sha256Of(v2));

		// A further reconcile pass finds the preview current and renders nothing.
		h.setEnabled(false);
		h.setEnabled(true);
		await h.advance(120_000);
		await h.drain();
		expect(h.renderer.calls.length).toBe(2);
	});
});
