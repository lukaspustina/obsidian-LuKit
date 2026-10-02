import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews-auto-embed p2 c12", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("embeds the JPG directly below the link line, keeps the stale PNG line below it, and is idempotent on re-render", async () => {
		h = createHarness();
		const note = "Notizen/M.md";
		const source = "_resources/Folie.pptx";
		await h.start();
		h.putFile(note, "Folien: [[Folie.pptx]]\n![[Folie.pptx.png]]\n");

		h.createSource(source, "slides v1");
		await h.drain();
		await h.settle();

		expect(h.mirror(source).endsWith(".jpg")).toBe(true);
		expect(h.exists(h.mirror(source))).toBe(true);
		const afterFirst = "Folien: [[Folie.pptx]]\n![[Folie.pptx.jpg]]\n![[Folie.pptx.png]]\n";
		expect(h.readText(note)).toBe(afterFirst);

		h.changeSource(source, "slides v2");
		await h.drain();
		await h.settle();

		expect(h.renderer.renderedPaths()).toEqual([source, source]);
		expect(h.readText(note)).toBe(afterFirst);
	});
});
