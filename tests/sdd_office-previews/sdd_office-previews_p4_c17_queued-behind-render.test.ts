import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p4 c17", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("renders two dropped sources in order behind a 20 s render and embeds both", async () => {
		h = createHarness();
		const note = "Notizen/N.md";
		h.putFile(note, "Intro\n![[A.docx]]\n![[B.docx]]\n");
		const ed = h.openNote(note);
		await h.start();
		// Added after the startup reconcile, which would otherwise render it before the test holds the renderer.
		h.addSource("Alt/Alt.docx");

		// An unrelated render is already running.
		h.setActiveFile("Alt/Alt.docx");
		h.renderer.hold();
		await h.runCommand("office-previews-render-active");
		expect(h.renderer.renderedPaths()).toEqual(["Alt/Alt.docx"]);

		h.drop(note, ["A.docx", "B.docx"]);
		h.createSource("_resources/A.docx");
		h.createSource("_resources/B.docx");
		await h.settle();
		expect(h.renderer.calls).toHaveLength(1);

		await h.advance(20_000);
		h.renderer.unhold();
		h.renderer.release();
		await h.advance(1_000);

		expect(h.renderer.renderedPaths()).toEqual(["Alt/Alt.docx", "_resources/A.docx", "_resources/B.docx"]);
		expect(ed.getValue()).toBe("Intro\n[[A.docx]]\n![[A.docx.png]]\n[[B.docx]]\n![[B.docx.png]]\n");
	});
});
