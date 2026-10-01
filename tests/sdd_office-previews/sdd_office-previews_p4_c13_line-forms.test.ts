import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const NOTE = "Notizen/N.md";
const SOURCE = "_resources/Angebot.docx";

describe("SDD office-previews p4 c13", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	async function insertInto(content: string): Promise<string> {
		h = createHarness();
		await h.start();
		h.putFile(NOTE, content);
		const editor = h.openNote(NOTE);
		h.drop(NOTE, ["Angebot.docx"]);
		h.createSource(SOURCE);
		await h.settle();
		return editor.getValue();
	}

	it("converts only the first matching embed on a line with several links", async () => {
		const result = await insertInto("![[Notiz]] ![[Angebot.docx]] ![[Angebot.docx]]\n");
		expect(result).toBe("![[Notiz]] [[Angebot.docx]] ![[Angebot.docx]]\n![[Angebot.docx.png]]\n");
	});

	it("drops a numeric size when converting the embed", async () => {
		const result = await insertInto("![[Angebot.docx|300]]\n");
		expect(result).toBe("[[Angebot.docx]]\n![[Angebot.docx.png]]\n");
	});

	it("copies the indentation of a list item without a bullet", async () => {
		const result = await insertInto("x\n  - ![[Angebot.docx]]\n");
		expect(result).toBe("x\n  - [[Angebot.docx]]\n  ![[Angebot.docx.png]]\n");
	});
});
