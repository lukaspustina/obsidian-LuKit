import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";
import { MODIFY_DEBOUNCE_MS } from "../../src/features/office-previews/office-previews-engine";

describe("SDD office-previews p2 c22", () => {
	let h: Harness;
	afterEach(() => h.dispose());

	it("drops a job whose absolute file is not on disk and records no failure", async () => {
		let onDisk = true;
		h = createHarness({ fileExists: () => onDisk });
		h.layoutReady();

		h.createSource("Docs/Angebot.docx");
		// Debounce passes, job is queued and waits for its jitter.
		await h.advance(MODIFY_DEBOUNCE_MS + 1);
		await h.settle();
		expect((await h.status()).queued).toBe(1);

		// Source disappears from disk (e.g. selective sync) before the job runs.
		onDisk = false;
		await h.drain();

		expect(h.renderer.calls).toHaveLength(0);
		expect(h.preview("Docs/Angebot.docx")).toBeUndefined();
		const status = await h.status();
		expect(status.failed).toBe(0);
		expect(status.queued).toBe(0);
		expect(h.storage.get("lukit.officePreviews.failures") ?? {}).toEqual({});
	});

	it("drops a job whose source was removed from the vault and records no failure", async () => {
		h = createHarness();
		h.layoutReady();

		h.createSource("Docs/Bericht.xlsx");
		await h.advance(MODIFY_DEBOUNCE_MS + 1);
		await h.settle();

		h.deleteFile("Docs/Bericht.xlsx");
		await h.drain();

		expect(h.renderer.calls).toHaveLength(0);
		expect(h.exists(h.mirror("Docs/Bericht.xlsx"))).toBe(false);
		const status = await h.status();
		expect(status.failed).toBe(0);
		expect(status.queued).toBe(0);
	});

	it("does not remember a gone source as failed, so it renders once it is back on disk", async () => {
		let onDisk = false;
		h = createHarness({ fileExists: () => onDisk });
		h.layoutReady();

		h.createSource("Docs/Folien.pptx");
		await h.drain();
		expect(h.renderer.calls).toHaveLength(0);
		expect((await h.status()).failed).toBe(0);

		// Same content, now available: no failure entry blocks it.
		onDisk = true;
		h.changeSource("Docs/Folien.pptx", "content of Docs/Folien.pptx");
		await h.drain();

		expect(h.renderer.renderedPaths()).toEqual(["Docs/Folien.pptx"]);
		expect(h.previewMarker("Docs/Folien.pptx")).not.toBeNull();
	});
});
