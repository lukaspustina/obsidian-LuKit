import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p2 c9", () => {
	let h: Harness;
	afterEach(() => h.dispose());

	it("queues nothing and schedules no timer when a source is created while disabled", async () => {
		h = createHarness({ enabled: false });
		h.layoutReady();
		await h.settle();
		const timersBefore = h.timersScheduled;

		h.createSource("Docs/Angebot.docx");
		await h.drain();

		expect(h.timersScheduled).toBe(timersBefore);
		expect(h.renderer.calls).toHaveLength(0);
		expect(h.preview("Docs/Angebot.docx")).toBeUndefined();
	});

	it("does not reconcile after layout ready while disabled", async () => {
		h = createHarness({ enabled: false });
		h.addSource("Docs/Angebot.docx");

		await h.start();

		expect(h.renderer.calls).toHaveLength(0);
		expect(h.preview("Docs/Angebot.docx")).toBeUndefined();
	});

	it("clears a queued job when toggled off", async () => {
		h = createHarness({ enabled: true });
		h.layoutReady();
		h.createSource("Docs/Angebot.docx");
		await h.advance(5_000 + 1_000); // debounce elapsed, job queued behind its jitter
		expect((await h.status()).queued).toBe(1);

		h.setEnabled(false);
		await h.drain();

		expect(h.renderer.calls).toHaveLength(0);
		expect(h.preview("Docs/Angebot.docx")).toBeUndefined();
	});

	it("clears a pending debounce when toggled off", async () => {
		h = createHarness({ enabled: true });
		h.layoutReady();
		h.createSource("Docs/Angebot.docx");

		h.setEnabled(false);
		await h.drain();

		expect(h.renderer.calls).toHaveLength(0);
		expect(h.preview("Docs/Angebot.docx")).toBeUndefined();
	});

	it("clears the pending reconcile timer when toggled off", async () => {
		h = createHarness({ enabled: true });
		h.addSource("Docs/Angebot.docx");
		h.layoutReady();
		await h.advance(60_000);

		h.setEnabled(false);
		await h.advance(120_000);
		await h.drain();

		expect(h.renderer.calls).toHaveLength(0);
		expect(h.preview("Docs/Angebot.docx")).toBeUndefined();
	});

	it("schedules a reconcile 120 s after toggling on", async () => {
		h = createHarness({ enabled: false });
		h.addSource("Docs/Angebot.docx");
		h.layoutReady();
		await h.settle();

		h.setEnabled(true);
		await h.advance(119_000);
		await h.settle();
		expect((await h.status()).queued).toBe(0);
		expect(h.renderer.calls).toHaveLength(0);

		await h.advance(1_000);
		await h.settle();
		expect((await h.status()).queued).toBe(1);

		await h.drain();
		expect(h.renderer.renderedPaths()).toEqual(["Docs/Angebot.docx"]);
		expect(h.previewMarker("Docs/Angebot.docx")).not.toBeNull();
	});
});
