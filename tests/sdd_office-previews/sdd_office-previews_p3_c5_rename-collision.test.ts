import { afterEach, describe, expect, it, type Mock } from "vitest";
import { createHarness, markedPreview, sha256Of, tinyPng, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p3 c5", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("changes neither file and records a collision when the new mirror path holds an unmarked file", async () => {
		h = createHarness();
		const oldSource = "Alt/Angebot.docx";
		const newSource = "Neu/Angebot.docx";
		const marked = markedPreview(oldSource, sha256Of(`content of ${oldSource}`));
		const occupant = tinyPng(7);
		h.addSource(oldSource);
		h.putFile(h.mirror(oldSource), marked);
		h.putFile(h.mirror(newSource), occupant);

		await h.start();
		expect(await h.status()).toMatchObject({ failed: 0 });

		h.renameSource(oldSource, newSource);
		await h.drain();

		const renameFile = (h.plugin.app as { fileManager: { renameFile: Mock } }).fileManager.renameFile;
		expect(renameFile).not.toHaveBeenCalled();
		expect(h.read(h.mirror(oldSource))).toEqual(marked);
		expect(h.read(h.mirror(newSource))).toEqual(occupant);
		expect(h.renderer.calls).toHaveLength(0);
		expect(await h.status()).toMatchObject({ failed: 1 });
	});
});
