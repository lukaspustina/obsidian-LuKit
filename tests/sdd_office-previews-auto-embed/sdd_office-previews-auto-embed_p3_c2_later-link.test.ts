import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

const SOURCE = "_resources/Angebot.docx";
const CONTENT = `content of ${SOURCE}`;

describe("SDD office-previews-auto-embed p3 c2", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("a second backfill embeds into a note that linked the rendered document later and changes no other note", async () => {
		h = createHarness();
		h.addSource(SOURCE, CONTENT);
		h.putFile(h.mirror(SOURCE), markedPreview(SOURCE, sha256Of(CONTENT)));
		h.putFile("Notizen/Alt.md", "Siehe [[Angebot.docx]]\n");
		await h.start();

		await h.runCommand("office-previews-embed-missing");
		await h.settle();
		expect(h.readText("Notizen/Alt.md")).toBe("Siehe [[Angebot.docx]]\n![[Angebot.docx.png]]\n");

		h.putFile("Notizen/Neu.md", "Neu: [[Angebot.docx]]\n");
		const writesBefore = h.vaultProcess.mock.calls.length;

		await h.runCommand("office-previews-embed-missing");
		await h.settle();

		expect(h.readText("Notizen/Neu.md")).toBe("Neu: [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(h.readText("Notizen/Alt.md")).toBe("Siehe [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(h.vaultProcess.mock.calls.length - writesBefore).toBe(1);
		expect(h.lastNotice()).toBe("Einbettungen ergänzt: 1 in 1 Notizen");
	});
});
