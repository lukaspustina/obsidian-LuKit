import { afterEach, describe, expect, it, vi } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const GONE = "Notizen/A.md";
const KEPT = "Notizen/B.md";
const SOURCE = "_resources/Angebot.docx";

describe("SDD office-previews-auto-embed p2 c14", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
		vi.restoreAllMocks();
	});

	it("skips a note deleted between listing and write and still embeds into the other linking note", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		h = createHarness();
		await h.start();
		h.putFile(GONE, "text with [[Angebot.docx]]\n");
		h.putFile(KEPT, "other text with [[Angebot.docx]]\n");
		h.createSource(SOURCE);
		h.freezeResolvedLinks();
		h.deleteFile(GONE);

		await h.drain();
		await h.settle();

		expect(h.exists(GONE)).toBe(false);
		expect(h.preview(SOURCE)).toBeDefined();
		expect(h.readText(KEPT)).toBe("other text with [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(h.notices()).toEqual([]);
	});
});
