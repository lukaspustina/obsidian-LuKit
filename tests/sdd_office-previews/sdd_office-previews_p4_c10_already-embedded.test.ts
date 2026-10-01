import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const NOTE = "Notizen/N.md";
const SOURCE = "_resources/Angebot.docx";
const CONTENT = "intro\n[[Angebot.docx]]\n![[Angebot.docx.png]]\noutro\n";

describe("SDD office-previews p4 c10", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("inserts no second embed into a closed note that already embeds the preview", async () => {
		h = createHarness();
		await h.start();
		h.putFile(NOTE, CONTENT);

		h.drop(NOTE, ["Angebot.docx"]);
		h.createSource(SOURCE);
		await h.settle();

		expect(h.preview(SOURCE)).toBeDefined();
		expect(h.readText(NOTE)).toBe(CONTENT);
	});

	it("inserts no second embed into an open note that already embeds the preview", async () => {
		h = createHarness();
		await h.start();
		h.putFile(NOTE, CONTENT);
		const editor = h.openNote(NOTE);

		h.drop(NOTE, ["Angebot.docx"]);
		h.createSource(SOURCE);
		await h.settle();

		expect(h.preview(SOURCE)).toBeDefined();
		expect(editor.getValue()).toBe(CONTENT);
		expect(editor.transactions).toHaveLength(0);
	});
});
