import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

const CMD = "office-previews-embed-missing";

describe("SDD office-previews-auto-embed p3 c1", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("embeds into every linking note once, reports exact numbers, and a second run writes nothing", async () => {
		h = createHarness();
		const docx = "_resources/Angebot.docx";
		const xlsx = "_resources/Tabelle.xlsx";
		const docxContent = "angebot body";
		const xlsxContent = "tabelle body";
		// Previews left over from an earlier version: current, so the reconcile renders nothing.
		h.addSource(docx, docxContent);
		h.putFile(h.mirror(docx), markedPreview(docx, sha256Of(docxContent)));
		h.addSource(xlsx, xlsxContent);
		h.putFile(h.mirror(xlsx), markedPreview(xlsx, sha256Of(xlsxContent)));
		h.putFile("Notizen/A.md", "Siehe [[Angebot.docx]]\n");
		h.putFile("Notizen/B.md", "Siehe [[Angebot.docx]] und [[Tabelle.xlsx]]\n");
		h.putFile("Notizen/C.md", "Zahlen in [[Tabelle.xlsx]]\n");

		await h.start();
		await h.settle();
		expect(h.renderer.renderedPaths()).toEqual([]);
		expect(h.vaultProcess.mock.calls).toHaveLength(0);

		await h.runCommand(CMD);
		await h.advance(100);
		await h.settle();

		expect(h.readText("Notizen/A.md")).toBe("Siehe [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(h.readText("Notizen/B.md")).toBe(
			"Siehe [[Angebot.docx]] und [[Tabelle.xlsx]]\n![[Angebot.docx.png]]\n![[Tabelle.xlsx.png]]\n",
		);
		expect(h.readText("Notizen/C.md")).toBe("Zahlen in [[Tabelle.xlsx]]\n![[Tabelle.xlsx.png]]\n");
		expect(h.notices().filter((n) => n.startsWith("Einbettungen"))).toEqual(["Einbettungen ergänzt: 4 in 3 Notizen"]);

		// Second run: nothing to do.
		const writes = h.vaultProcess.mock.calls.length;
		await h.runCommand(CMD);
		await h.advance(100);
		await h.settle();

		expect(h.vaultProcess.mock.calls).toHaveLength(writes);
		expect(h.readText("Notizen/A.md")).toBe("Siehe [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(h.lastNotice()).toBe("Einbettungen ergänzt: 0 in 0 Notizen");
	});

	it("shows the zero summary for a run with nothing to do", async () => {
		h = createHarness();
		await h.start();
		await h.settle();

		await h.runCommand(CMD);
		await h.settle();

		expect(h.notices().filter((n) => n.startsWith("Einbettungen"))).toEqual(["Einbettungen ergänzt: 0 in 0 Notizen"]);
	});
});
