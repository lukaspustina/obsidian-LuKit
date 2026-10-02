import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

const SOURCE = "_resources/Angebot.docx";
const COMMAND = "office-previews-embed-missing";
const N = "Notizen/N.md";
const N_FRESH = "Notizen/Frisch.md";

const N_CONTENT = "Erste [[Angebot.docx]]\n![[Angebot.docx.png]]\nZweite Zeile mit [[Angebot.docx]]\n";
const FRESH_CONTENT = "Neu [[Angebot.docx]]\n";

describe("SDD office-previews-auto-embed p3 c14", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("leaves a note that already embeds the preview unchanged (first-line-only) and embeds a fresh link exactly once", async () => {
		h = createHarness();
		h.addSource(SOURCE);
		h.putFile(h.mirror(SOURCE), markedPreview(SOURCE, sha256Of(`content of ${SOURCE}`)));
		h.putFile(N, N_CONTENT);
		h.putFile(N_FRESH, FRESH_CONTENT);
		await h.start();

		await h.runCommand(COMMAND);
		await h.settle();
		expect(h.readText(N)).toBe(N_CONTENT);
		expect(h.readText(N_FRESH)).toBe("Neu [[Angebot.docx]]\n![[Angebot.docx.png]]\n");

		const writesAfterFirst = h.vaultProcess.mock.calls.length;
		await h.runCommand(COMMAND);
		await h.settle();
		expect(h.readText(N)).toBe(N_CONTENT);
		expect(h.readText(N_FRESH)).toBe("Neu [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(h.vaultProcess.mock.calls.length).toBe(writesAfterFirst);
	});
});
