import { afterEach, describe, expect, it, type Mock } from "vitest";
import { createHarness, sha256Of, tinyPng, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p3 c7", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("does not move an unmarked preview and handles the renamed source as a create", async () => {
		h = createHarness();
		await h.start();

		const oldPath = "Alt/Angebot.docx";
		const newPath = "Neu/Angebot.docx";
		const content = "document content";
		const unmarked = tinyPng(7);
		h.addSource(oldPath, content);
		h.putFile(h.mirror(oldPath), unmarked);

		h.renameSource(oldPath, newPath);
		await h.settle();
		await h.drain();

		const renameFile = (h.plugin.app as { fileManager: { renameFile: Mock } }).fileManager.renameFile;
		expect(renameFile).not.toHaveBeenCalled();

		// The unmarked file stays where it was.
		expect(h.preview(oldPath)).toEqual(unmarked);

		// The source at its new path is rendered like a fresh create.
		expect(h.renderer.renderedPaths()).toEqual([newPath]);
		expect(h.previewMarker(newPath)).toEqual({ version: 1, sha256: sha256Of(content) });
		expect(await h.status()).toMatchObject({ failed: 0 });
	});
});
