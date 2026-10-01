import { afterEach, describe, expect, it, type Mock } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

interface AppMocks {
	fileManager: { renameFile: Mock };
	vault: { adapter: { mkdir: Mock } };
}

describe("SDD office-previews p3 c1", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("moves a marked preview via renameFile, creates missing folders first and removes the emptied old parent", async () => {
		h = createHarness();
		const oldSource = "Alt/Angebot.docx";
		const newSource = "Neu/Unter/Angebot.docx";
		const bytes = markedPreview(oldSource, sha256Of(`content of ${oldSource}`));
		h.addSource(oldSource);
		h.putFile(h.mirror(oldSource), bytes);
		const oldMirror = h.mirror(oldSource);
		const newMirror = h.mirror(newSource);

		await h.start();
		expect(h.renderer.calls).toHaveLength(0);

		h.renameSource(oldSource, newSource);
		await h.drain();

		const app = h.plugin.app as AppMocks;
		const renameFile = app.fileManager.renameFile;
		expect(renameFile).toHaveBeenCalledTimes(1);
		expect(renameFile.mock.calls[0][1]).toBe(newMirror);

		// Missing target folders were created before the move.
		const mkdir = app.vault.adapter.mkdir;
		expect(mkdir).toHaveBeenCalled();
		expect(Math.min(...mkdir.mock.invocationCallOrder)).toBeLessThan(renameFile.mock.invocationCallOrder[0]);

		// The image moved unchanged; nothing was re-rendered.
		expect(h.exists(oldMirror)).toBe(false);
		expect(h.read(newMirror)).toEqual(bytes);
		expect(h.renderer.calls).toHaveLength(0);

		// Emptied old parent is gone, the preview folder itself stays.
		expect(h.exists("_previews/Alt")).toBe(false);
		expect(h.exists("_previews")).toBe(true);
	});
});
