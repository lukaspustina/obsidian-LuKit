import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const NOTE = "Notizen/N.md";

describe("SDD office-previews p4 c3", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("matches a source with Obsidian's collision suffix to the drop", async () => {
		h = createHarness();
		h.putFile(NOTE, "text with ![[Angebot 1.docx]]\n");
		const ed = h.openNote(NOTE);
		await h.start();
		// Added after the startup reconcile, which would otherwise render it.
		h.putFile("_resources/Angebot.docx", "an older document");

		h.drop(NOTE, ["Angebot.docx"]);
		h.createSource("_resources/Angebot 1.docx");
		await h.settle();

		// Immediate render (no debounce, no jitter) proves the match.
		expect(h.renderer.renderedPaths()).toEqual(["_resources/Angebot 1.docx"]);
		expect(ed.getValue()).toBe("text with [[Angebot 1.docx]]\n![[Angebot 1.docx.png]]\n");
	});
});
