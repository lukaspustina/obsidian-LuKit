import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const NOTE = "Notizen/M.md";
const A = "_resources/a.docx";
const B = "_resources/b.xlsx";
const LINKS = "Anhänge: ![[a.docx]], ![[b.xlsx]]\n";

describe("SDD office-previews-auto-embed p2 c18", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("keeps the note byte-identical and the embed order a, b when renders run again in order b, a", async () => {
		h = createHarness();
		h.putFile(NOTE, LINKS);
		await h.start();

		h.createSource(A);
		await h.drain();
		await h.settle();
		h.createSource(B);
		await h.drain();
		await h.settle();

		const afterFirstPass = h.readText(NOTE);
		expect(afterFirstPass).toBe(`${LINKS}![[a.docx.png]]\n![[b.xlsx.png]]\n`);

		h.changeSource(B, "new content of b");
		await h.drain();
		await h.settle();
		h.changeSource(A, "new content of a");
		await h.drain();
		await h.settle();

		expect(h.renderer.renderedPaths()).toEqual([A, B, B, A]);
		expect(h.readText(NOTE)).toBe(afterFirstPass);
	});
});
