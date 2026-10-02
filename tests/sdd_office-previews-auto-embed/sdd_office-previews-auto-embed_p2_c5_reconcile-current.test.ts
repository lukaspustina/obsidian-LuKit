import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews-auto-embed p2 c5", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("writes no note for a preview the reconcile finds current, but embeds for a source it renders", async () => {
		h = createHarness();
		const current = "_resources/Angebot.docx";
		const fresh = "_resources/Neu.docx";
		const currentContent = "current document body";
		h.addSource(current, currentContent);
		h.putFile(h.mirror(current), markedPreview(current, sha256Of(currentContent)));
		h.addSource(fresh, "fresh document body");
		h.putFile("Notizen/Alt.md", "Siehe [[Angebot.docx]]\n");
		h.putFile("Notizen/Neu.md", "Siehe [[Neu.docx]]\n");

		await h.start();
		await h.settle();

		// Only the source without a preview was rendered.
		expect(h.renderer.renderedPaths()).toEqual([fresh]);

		// Positive control: the rendered source's linking note gets the embed.
		expect(h.readText("Notizen/Neu.md")).toBe("Siehe [[Neu.docx]]\n![[Neu.docx.png]]\n");

		// The current preview's linking note is untouched.
		expect(h.readText("Notizen/Alt.md")).toBe("Siehe [[Angebot.docx]]\n");
		expect(h.vaultProcess.mock.calls).toHaveLength(1);
	});
});
