import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const NOTE = "Notizen/N.md";
const SOURCE = "_resources/Angebot.docx";
const ORIGINAL = "text with ![[Angebot.docx]]\n";

describe("SDD office-previews p4 c7", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("finds the link at insertion time when lines were typed above it during the render", async () => {
		h = createHarness();
		h.putFile(NOTE, ORIGINAL);
		const ed = h.openNote(NOTE);
		await h.start();

		h.renderer.hold();
		h.drop(NOTE, ["Angebot.docx"]);
		h.createSource(SOURCE);
		await h.settle();

		ed.setValue(`one\ntwo\nthree\n${ORIGINAL}`);
		h.renderer.release();
		await h.settle();

		expect(ed.getValue()).toBe("one\ntwo\nthree\ntext with [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(ed.transactions).toHaveLength(1);
	});
});
