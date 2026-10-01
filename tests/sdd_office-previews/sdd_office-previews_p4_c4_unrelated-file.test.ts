import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const NOTE = "Notizen/N.md";
const CONTENT = "![[Angebot.docx]]\n![[Bericht.docx]]\n";

describe("SDD office-previews p4 c4", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("does not match an unrelated file, which is queued with the random delay, and keeps the record for the real one", async () => {
		h = createHarness();
		h.putFile(NOTE, CONTENT);
		const ed = h.openNote(NOTE);
		await h.start();

		h.drop(NOTE, ["Angebot.docx"]);
		await h.advance(1000);
		h.createSource("_resources/Bericht.docx");
		await h.settle();
		expect(h.renderer.calls).toHaveLength(0);

		await h.advance(1000);
		h.createSource("_resources/Angebot.docx");
		await h.settle();

		// The matched file renders at once and gets its embed; the unrelated one waits.
		expect(h.renderer.renderedPaths()).toEqual(["_resources/Angebot.docx"]);
		expect(ed.getValue()).toBe("[[Angebot.docx]]\n![[Angebot.docx.png]]\n![[Bericht.docx]]\n");

		// Debounce (5 s) plus minimum jitter (30 s) have not passed for the unrelated file.
		await h.advance(25_000);
		expect(h.renderer.renderedPaths()).toEqual(["_resources/Angebot.docx"]);

		await h.drain();
		expect(h.renderer.renderedPaths()).toEqual(["_resources/Angebot.docx", "_resources/Bericht.docx"]);
		expect(ed.getValue()).toBe("[[Angebot.docx]]\n![[Angebot.docx.png]]\n![[Bericht.docx]]\n");
	});
});
