import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, tinyPng, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews-auto-embed p3 c4", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("skips an image without a valid marker but embeds a marked preview in the same run", async () => {
		h = createHarness();
		const foreign = "_resources/Fremd.docx";
		const marked = "_resources/Angebot.docx";
		const markedContent = "marked document body";
		h.addSource(foreign, "foreign document body");
		h.putFile(h.mirror(foreign), tinyPng());
		h.addSource(marked, markedContent);
		h.putFile(h.mirror(marked), markedPreview(marked, sha256Of(markedContent)));
		h.putFile("Notizen/Fremd.md", "Siehe [[Fremd.docx]]\n");
		h.putFile("Notizen/Angebot.md", "Siehe [[Angebot.docx]]\n");

		await h.start();
		await h.settle();
		expect(h.vaultProcess.mock.calls).toHaveLength(0);

		await h.runCommand("office-previews-embed-missing");
		await h.settle();

		// Positive control: the marked preview is embedded.
		expect(h.readText("Notizen/Angebot.md")).toBe("Siehe [[Angebot.docx]]\n![[Angebot.docx.png]]\n");

		// The unmarked image is not ours: its linking note stays unchanged.
		expect(h.readText("Notizen/Fremd.md")).toBe("Siehe [[Fremd.docx]]\n");
		expect(h.vaultProcess.mock.calls).toHaveLength(1);
	});
});
