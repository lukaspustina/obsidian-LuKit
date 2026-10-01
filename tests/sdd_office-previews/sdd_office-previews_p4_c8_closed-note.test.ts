import { afterEach, describe, expect, it, type Mock } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

interface AppMocks {
	vault: { process: Mock };
}

const NOTE = "Notizen/N.md";
const SOURCE = "_resources/Angebot.docx";
const BEFORE = "text with ![[Angebot.docx]]\n";
const AFTER = "text with [[Angebot.docx]]\n![[Angebot.docx.png]]\n";

describe("SDD office-previews p4 c8", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("writes through vault.process when the note was closed before the render finished", async () => {
		h = createHarness();
		await h.start();
		h.putFile(NOTE, BEFORE);
		h.openNote(NOTE);
		h.renderer.hold();

		h.drop(NOTE, ["Angebot.docx"]);
		h.createSource(SOURCE);
		await h.settle();
		expect(h.renderer.held).toHaveLength(1);

		h.closeNote(NOTE);
		h.renderer.release();
		await h.settle();

		expect((h.plugin.app as unknown as AppMocks).vault.process).toHaveBeenCalledTimes(1);
		expect(h.readText(NOTE)).toBe(AFTER);
	});

	it("uses the editor of the view when the note is open in a non-first split", async () => {
		h = createHarness();
		await h.start();
		h.putFile(NOTE, BEFORE);
		h.putFile("Notizen/Other.md", "other\n");
		const other = h.openNote("Notizen/Other.md");
		const editor = h.openNote(NOTE);

		h.drop(NOTE, ["Angebot.docx"]);
		h.createSource(SOURCE);
		await h.settle();

		expect(editor.getValue()).toBe(AFTER);
		expect(editor.transactions).toHaveLength(1);
		expect(other.transactions).toHaveLength(0);
		expect(other.getValue()).toBe("other\n");
		expect((h.plugin.app as unknown as AppMocks).vault.process).not.toHaveBeenCalled();
	});
});
