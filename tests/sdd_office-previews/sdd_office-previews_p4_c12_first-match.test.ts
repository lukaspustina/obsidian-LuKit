import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const NOTE = "Notizen/N.md";
const SOURCE = "_resources/Angebot.docx";
const BEFORE = "intro\n![[Angebot.docx]]\nmiddle\n![[Angebot.docx]]\n";
const AFTER = "intro\n[[Angebot.docx]]\n![[Angebot.docx.png]]\nmiddle\n![[Angebot.docx]]\n";

describe("SDD office-previews p4 c12", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("uses the first matching line from the top in an open note", async () => {
		h = createHarness();
		await h.start();
		h.putFile(NOTE, BEFORE);
		const editor = h.openNote(NOTE);

		h.drop(NOTE, ["Angebot.docx"]);
		h.createSource(SOURCE);
		await h.settle();

		expect(editor.getValue()).toBe(AFTER);
	});

	it("uses the first matching line from the top in a closed note", async () => {
		h = createHarness();
		await h.start();
		h.putFile(NOTE, BEFORE);

		h.drop(NOTE, ["Angebot.docx"]);
		h.createSource(SOURCE);
		await h.settle();

		expect(h.readText(NOTE)).toBe(AFTER);
	});
});
