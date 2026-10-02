import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const SOURCE = "_resources/Angebot.docx";
const EMBED_NOTE = "Notizen/A.md";
const LINK_NOTE = "Notizen/B.md";

describe("SDD office-previews-auto-embed p2 c1", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("embeds the preview below the link line of both a source embed and a plain link, leaving the link lines unchanged", async () => {
		h = createHarness();
		h.putFile(EMBED_NOTE, "Siehe ![[Angebot.docx]]\n");
		h.putFile(LINK_NOTE, "Siehe [[Angebot.docx]]\n");
		await h.start();

		h.createSource(SOURCE);
		await h.drain();
		await h.settle();

		expect(h.preview(SOURCE)).toBeDefined();
		expect(h.readText(EMBED_NOTE)).toBe("Siehe ![[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(h.readText(LINK_NOTE)).toBe("Siehe [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
	});
});
