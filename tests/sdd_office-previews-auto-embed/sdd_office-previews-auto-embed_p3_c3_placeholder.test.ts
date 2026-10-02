import { afterEach, describe, expect, it } from "vitest";
import { writeMarkerPng, type PreviewMarker } from "../../src/features/office-previews/office-previews-engine";
import { createHarness, sha256Of, tinyPng, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews-auto-embed p3 c3", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	const NOTE = "Notizen/M.md";
	const SRC = "_resources/Angebot.docx";

	it("embeds an existing placeholder with a valid marker into its linking note", async () => {
		h = createHarness();
		h.addSource(SRC);
		const marker = { version: 1, sha256: sha256Of(`content of ${SRC}`), placeholder: true } as unknown as PreviewMarker;
		h.putFile(h.mirror(SRC), writeMarkerPng(tinyPng(), marker));
		h.putFile(NOTE, "Siehe [[Angebot.docx]]\n");
		await h.start();
		await h.settle();

		expect(h.previewMarker(SRC)?.placeholder).toBe(true);
		expect(h.readText(NOTE)).toBe("Siehe [[Angebot.docx]]\n");

		await h.runCommand("office-previews-embed-missing");
		await h.settle();

		expect(h.readText(NOTE)).toBe("Siehe [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(h.notices()).toContain("Einbettungen ergänzt: 1 in 1 Notizen");
	});
});
