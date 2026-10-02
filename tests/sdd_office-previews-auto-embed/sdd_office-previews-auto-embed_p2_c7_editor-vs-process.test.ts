import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const OPEN_NOTE = "Notizen/Offen.md";
const CLOSED_NOTE = "Notizen/Geschlossen.md";
const SOURCE = "_resources/Angebot.docx";
const BEFORE = "text with [[Angebot.docx]]\n";
const AFTER = "text with [[Angebot.docx]]\n![[Angebot.docx.png]]\n";

describe("SDD office-previews-auto-embed p2 c7", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("writes an open note with exactly one editor.transaction and no vault.process", async () => {
		h = createHarness();
		h.putFile(OPEN_NOTE, BEFORE);
		const ed = h.openNote(OPEN_NOTE);
		await h.start();

		h.createSource(SOURCE);
		await h.drain();
		await h.settle();

		expect(ed.transactions.length).toBe(1);
		expect(h.vaultProcess.mock.calls.length).toBe(0);
		expect(ed.getValue()).toBe(AFTER);
	});

	it("writes a closed note with exactly one vault.process and no editor.transaction", async () => {
		h = createHarness();
		h.putFile(CLOSED_NOTE, BEFORE);
		const other = "Notizen/Andere.md";
		h.putFile(other, "unrelated\n");
		const ed = h.openNote(other);
		await h.start();

		h.createSource(SOURCE);
		await h.drain();
		await h.settle();

		expect(h.vaultProcess.mock.calls.length).toBe(1);
		expect(ed.transactions.length).toBe(0);
		expect(h.readText(CLOSED_NOTE)).toBe(AFTER);
	});
});
