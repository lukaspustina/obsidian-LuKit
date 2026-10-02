import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p4 c18", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("matches a created file to a paste with file names like a drop", async () => {
		h = createHarness();
		const note = "Notizen/N.md";
		h.putFile(note, "Intro\n![[Angebot.docx]]\n");
		const ed = h.openNote(note);
		await h.start();

		h.paste(note, ["Angebot.docx"]);
		h.createSource("_resources/Angebot.docx");
		await h.settle();

		expect(h.renderer.renderedPaths()).toEqual(["_resources/Angebot.docx"]);
		expect(ed.getValue()).toBe("Intro\n[[Angebot.docx]]\n![[Angebot.docx.png]]\n");
	});

	it("records nothing for a paste without file names", async () => {
		h = createHarness();
		const note = "Notizen/N.md";
		const original = "Intro\n![[Angebot.docx]]\n";
		h.putFile(note, original);
		const ed = h.openNote(note);
		await h.start();

		h.paste(note, []);
		h.createSource("_resources/Angebot.docx");
		await h.settle();
		expect(h.renderer.calls).toHaveLength(0);

		await h.drain();
		expect(h.renderer.calls).toHaveLength(1);
		// No drop record: no link conversion, only the automatic embed (SDD office-previews-auto-embed).
		expect(ed.getValue()).toBe(original + "![[Angebot.docx.png]]\n");

		// Control: a paste with a name is recorded.
		const note2 = "Notizen/M.md";
		h.putFile(note2, "Intro\n![[Bericht.docx]]\n");
		const ed2 = h.openNote(note2);
		h.paste(note2, ["Bericht.docx"]);
		h.createSource("_resources/Bericht.docx");
		await h.settle();
		expect(ed2.getValue()).toBe("Intro\n[[Bericht.docx]]\n![[Bericht.docx.png]]\n");
	});

	it("matches each pending record to its own file", async () => {
		h = createHarness();
		const note1 = "Notizen/N.md";
		const note2 = "Notizen/M.md";
		h.putFile(note1, "Intro\n![[Angebot.docx]]\n");
		h.putFile(note2, "Intro\n![[Bericht.docx]]\n");
		const ed1 = h.openNote(note1);
		const ed2 = h.openNote(note2);
		await h.start();

		h.drop(note1, ["Angebot.docx"]);
		h.paste(note2, ["Bericht.docx"]);
		h.createSource("_resources/Bericht.docx");
		h.createSource("_resources/Angebot.docx");
		await h.settle();

		expect(ed1.getValue()).toBe("Intro\n[[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(ed2.getValue()).toBe("Intro\n[[Bericht.docx]]\n![[Bericht.docx.png]]\n");
	});
});
