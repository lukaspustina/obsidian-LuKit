import { afterEach, describe, expect, it } from "vitest";
import { createHarness, tinyPng, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews-auto-embed p2 c3", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	const NOTE = "Notizen/M.md";
	const SRC = "_resources/Angebot.docx";
	const LINKED = "Siehe [[Angebot.docx]]\n";
	const EMBEDDED = "Siehe [[Angebot.docx]]\n![[Angebot.docx.png]]\n";

	it("embeds the placeholder after a failed render, then a later successful render of the same extension writes no note", async () => {
		h = createHarness();
		await h.start();
		h.putFile(NOTE, LINKED);
		h.renderer.failWith("exit");

		h.createSource(SRC, "document v1");
		await h.drain();
		await h.settle();

		expect(h.previewMarker(SRC)?.placeholder).toBe(true);
		expect(h.readText(NOTE)).toBe(EMBEDDED);
		const writesAfterPlaceholder = h.vaultProcess.mock.calls.length;

		h.renderer.result = () => ({ ok: true, bytes: tinyPng() });
		h.changeSource(SRC, "document v2");
		await h.drain();
		await h.settle();

		expect(h.previewMarker(SRC)?.placeholder).toBeUndefined();
		expect(h.vaultProcess.mock.calls.length).toBe(writesAfterPlaceholder);
		expect(h.readText(NOTE)).toBe(EMBEDDED);
	});
});
