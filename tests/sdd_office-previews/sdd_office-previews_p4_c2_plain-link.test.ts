import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const NOTE = "Notizen/N.md";
const SOURCE = "_resources/Angebot.docx";

describe("SDD office-previews p4 c2", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("leaves a plain link line unchanged and inserts only the embed line", async () => {
		h = createHarness();
		h.putFile(NOTE, "see [[Angebot.docx]]\n");
		const ed = h.openNote(NOTE);
		await h.start();

		h.drop(NOTE, ["Angebot.docx"]);
		h.createSource(SOURCE);
		await h.settle();

		expect(ed.getValue()).toBe("see [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
	});

	it("inserts nothing for a markdown-style link", async () => {
		h = createHarness();
		const original = "see [x](Angebot.docx)\n";
		h.putFile(NOTE, original);
		const ed = h.openNote(NOTE);
		await h.start();

		h.drop(NOTE, ["Angebot.docx"]);
		h.createSource(SOURCE);
		await h.settle();

		// The drop is matched and rendered at once, but the note stays untouched.
		expect(h.renderer.renderedPaths()).toEqual([SOURCE]);
		expect(ed.getValue()).toBe(original);
		expect(ed.transactions).toHaveLength(0);
		expect(h.readText(NOTE)).toBe(original);
	});
});
