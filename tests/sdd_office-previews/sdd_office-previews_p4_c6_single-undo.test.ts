import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const NOTE = "Notizen/N.md";
const SOURCE = "_resources/Angebot.docx";
const ORIGINAL = "text with ![[Angebot.docx]]\n";

describe("SDD office-previews p4 c6", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("writes link conversion and embed in one editor transaction so one undo reverts both", async () => {
		h = createHarness();
		h.putFile(NOTE, ORIGINAL);
		const ed = h.openNote(NOTE);
		await h.start();

		h.renderer.hold();
		h.drop(NOTE, ["Angebot.docx"]);
		h.createSource(SOURCE);
		await h.settle();
		expect(ed.transactions).toHaveLength(0);

		h.renderer.release();
		await h.settle();

		expect(ed.getValue()).toBe("text with [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(ed.transactions).toHaveLength(1);

		ed.undo();
		expect(ed.getValue()).toBe(ORIGINAL);
	});
});
