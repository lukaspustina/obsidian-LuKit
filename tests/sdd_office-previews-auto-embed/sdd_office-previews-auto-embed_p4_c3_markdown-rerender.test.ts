import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const SOURCE = "_resources/Angebot.docx";
const NOTE = "Notizen/M.md";
const EMBED = "![Angebot.docx.png](_previews/_resources/Angebot.docx.png)";

describe("SDD office-previews-auto-embed p4 c3", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("holds exactly one Markdown embed after a render and a re-render, with no second write", async () => {
		h = createHarness({ linkStyle: "markdown" });
		h.putFile(NOTE, "text with [[Angebot.docx]]\n");
		await h.start();

		h.createSource(SOURCE);
		await h.drain();
		await h.settle();

		const expected = `text with [[Angebot.docx]]\n${EMBED}\n`;
		expect(h.readText(NOTE)).toBe(expected);
		const callsAfterFirst = h.vaultProcess.mock.calls.length;
		expect(callsAfterFirst).toBe(1);

		h.changeSource(SOURCE, "new content");
		await h.drain();
		await h.settle();

		expect(h.readText(NOTE)).toBe(expected);
		expect(h.vaultProcess.mock.calls.length).toBe(callsAfterFirst);
	});
});
