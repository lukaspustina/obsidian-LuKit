import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const SOURCE = "_resources/Angebot.docx";
const EMBEDDED = "Notizen/Embedded.md";
const PLAIN = "Notizen/Plain.md";
const EMBEDDED_TEXT = "Angebot von Max Mustermann: [[Angebot.docx]]\n![[Angebot.docx.png]]\n";

function processedPaths(h: Harness): string[] {
	return h.vaultProcess.mock.calls.map((call) => (call[0] as { path: string }).path);
}

describe("SDD office-previews-auto-embed p2 c2", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("leaves a note that already embeds the preview untouched on re-render, while a plain linking note is written", async () => {
		h = createHarness();
		h.putFile(EMBEDDED, EMBEDDED_TEXT);
		h.putFile(PLAIN, "Siehe [[Angebot.docx]]\n");
		await h.start();

		// First render: the plain note is the positive control.
		h.createSource(SOURCE);
		await h.drain();
		await h.settle();

		expect(h.readText(PLAIN)).toBe("Siehe [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(h.readText(EMBEDDED)).toBe(EMBEDDED_TEXT);
		expect(processedPaths(h)).toEqual([PLAIN]);

		// Re-render: neither note is written any more.
		h.vaultProcess.mockClear();
		h.changeSource(SOURCE, "new content");
		await h.drain();
		await h.settle();

		expect(h.renderer.renderedPaths()).toEqual([SOURCE, SOURCE]);
		expect(h.vaultProcess).not.toHaveBeenCalled();
		expect(h.readText(EMBEDDED)).toBe(EMBEDDED_TEXT);
	});

	it("makes zero editor transactions on an open note that already embeds the preview", async () => {
		h = createHarness();
		h.putFile(EMBEDDED, EMBEDDED_TEXT);
		h.putFile(PLAIN, "Siehe [[Angebot.docx]]\n");
		const embeddedEditor = h.openNote(EMBEDDED);
		const plainEditor = h.openNote(PLAIN);
		await h.start();

		h.createSource(SOURCE);
		await h.drain();
		await h.settle();

		expect(plainEditor.transactions).toHaveLength(1);
		expect(plainEditor.getValue()).toBe("Siehe [[Angebot.docx]]\n![[Angebot.docx.png]]\n");

		h.changeSource(SOURCE, "new content");
		await h.drain();
		await h.settle();

		expect(embeddedEditor.transactions).toHaveLength(0);
		expect(embeddedEditor.getValue()).toBe(EMBEDDED_TEXT);
		expect(plainEditor.transactions).toHaveLength(1);
		expect(h.vaultProcess).not.toHaveBeenCalled();
	});
});
