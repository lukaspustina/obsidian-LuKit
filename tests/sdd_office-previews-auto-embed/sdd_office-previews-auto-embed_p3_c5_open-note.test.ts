import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

const OPEN_NOTE = "Notizen/Offen.md";
const CLOSED_NOTE = "Notizen/Geschlossen.md";
const SOURCE = "_resources/Angebot.docx";
const BEFORE = "text with [[Angebot.docx]]\n";
const AFTER = "text with [[Angebot.docx]]\n![[Angebot.docx.png]]\n";

describe("SDD office-previews-auto-embed p3 c5", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("backfills an open note with exactly one editor.transaction and no vault.process, and a closed note via vault.process", async () => {
		h = createHarness();
		h.putFile(OPEN_NOTE, BEFORE);
		h.putFile(CLOSED_NOTE, BEFORE);
		h.addSource(SOURCE);
		h.putFile(h.mirror(SOURCE), markedPreview(SOURCE, sha256Of(`content of ${SOURCE}`)));
		const ed = h.openNote(OPEN_NOTE);
		await h.start();

		await h.runCommand("office-previews-embed-missing");
		await h.settle();

		expect(ed.transactions.length).toBe(1);
		expect(ed.getValue()).toBe(AFTER);
		expect(h.vaultProcess.mock.calls.length).toBe(1);
		expect(h.readText(CLOSED_NOTE)).toBe(AFTER);
	});
});
