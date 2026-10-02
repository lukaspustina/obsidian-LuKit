import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

const SYNCED = "_resources/Angebot.docx";
const LOCAL = "_resources/Bericht.docx";
const NOTE_SYNCED = "Notizen/M.md";
const NOTE_LOCAL = "Notizen/B.md";

describe("SDD office-previews-auto-embed p2 c4", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("does not edit notes when a marked preview arrives via sync, while a locally rendered source does embed", async () => {
		h = createHarness();
		h.putFile(NOTE_SYNCED, "Siehe [[Angebot.docx]]\n");
		h.putFile(NOTE_LOCAL, "Siehe [[Bericht.docx]]\n");
		await h.start();

		// Sync arrival: source and marked preview (matching sha) show up, no local render.
		const content = `content of ${SYNCED}`;
		h.addSource(SYNCED, content);
		h.putFile(h.mirror(SYNCED), markedPreview(SYNCED, sha256Of(content)));
		h.emit("create", h.mirror(SYNCED));
		await h.drain();
		await h.settle();

		expect(h.renderer.renderedPaths()).toEqual([]);
		expect(h.vaultProcess.mock.calls.length).toBe(0);
		expect(h.readText(NOTE_SYNCED)).toBe("Siehe [[Angebot.docx]]\n");

		// Positive control: a locally rendered source embeds into its linking note.
		h.createSource(LOCAL);
		await h.drain();
		await h.settle();

		expect(h.renderer.renderedPaths()).toEqual([LOCAL]);
		expect(h.readText(NOTE_LOCAL)).toBe("Siehe [[Bericht.docx]]\n![[Bericht.docx.png]]\n");
		expect(h.readText(NOTE_SYNCED)).toBe("Siehe [[Angebot.docx]]\n");
		expect(h.vaultProcess.mock.calls.length).toBe(1);
	});
});
