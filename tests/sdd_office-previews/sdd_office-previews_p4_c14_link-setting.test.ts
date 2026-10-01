import { afterEach, describe, expect, it, type Mock } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

interface AppMocks {
	fileManager: { generateMarkdownLink: Mock };
}

const NOTE = "Notizen/N.md";
const SOURCE = "_resources/Angebot.docx";

describe("SDD office-previews p4 c14", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("builds the embed text from generateMarkdownLink under the absolute path setting", async () => {
		h = createHarness({ linkStyle: "absolute" });
		await h.start();
		h.putFile(NOTE, "![[Angebot.docx]]\n");
		const editor = h.openNote(NOTE);

		h.drop(NOTE, ["Angebot.docx"]);
		h.createSource(SOURCE);
		await h.settle();

		const generate = (h.plugin.app as unknown as AppMocks).fileManager.generateMarkdownLink;
		const calls = generate.mock.calls as [{ path: string }, string][];
		const forPreview = calls.filter(([file]) => file.path === h.mirror(SOURCE));
		expect(forPreview.length).toBeGreaterThan(0);
		expect(forPreview[0][1]).toBe(NOTE);
		expect(editor.getValue()).toBe("[[Angebot.docx]]\n![[_previews/_resources/Angebot.docx.png]]\n");
	});
});
