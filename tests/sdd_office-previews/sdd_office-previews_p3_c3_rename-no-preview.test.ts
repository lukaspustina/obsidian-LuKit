import { afterEach, describe, expect, it, type Mock } from "vitest";
import { createHarness, sha256Of, type Harness } from "../helpers/office-previews-harness";
import { MODIFY_DEBOUNCE_MS } from "../../src/features/office-previews/office-previews-engine";

describe("SDD office-previews p3 c3", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("queues a renamed source without preview like a create and records no failure", async () => {
		h = createHarness();
		const oldSource = "Alt/Angebot.docx";
		const newSource = "Neu/Angebot.docx";

		await h.start(); // empty vault: nothing rendered
		h.addSource(oldSource);
		expect(h.exists(h.mirror(oldSource))).toBe(false);

		h.renameSource(oldSource, newSource);
		await h.advance(MODIFY_DEBOUNCE_MS + 1);
		await h.settle();

		expect(await h.status()).toEqual({ current: 0, queued: 1, failed: 0 });

		await h.drain();

		const renameFile = (h.plugin.app as { fileManager: { renameFile: Mock } }).fileManager.renameFile;
		expect(renameFile).not.toHaveBeenCalled();
		expect(h.renderer.renderedPaths()).toEqual([newSource]);
		expect(h.previewMarker(newSource)).toEqual({ version: 1, sha256: sha256Of(`content of ${oldSource}`) });
		expect(h.exists(h.mirror(oldSource))).toBe(false);
		expect(await h.status()).toMatchObject({ queued: 0, failed: 0 });
	});
});
