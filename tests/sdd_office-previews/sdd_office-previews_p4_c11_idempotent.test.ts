import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const NOTE = "Notizen/N.md";
const SOURCE = "_resources/Angebot.docx";

describe("SDD office-previews p4 c11", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("keeps a note with both the document embed and the preview embed byte-identical across two insertions", async () => {
		h = createHarness();
		await h.start();
		const original = "![[Angebot.docx]]\n![[Angebot.docx.png]]\n";
		h.putFile(NOTE, original);

		h.drop(NOTE, ["Angebot.docx"]);
		h.createSource(SOURCE);
		await h.settle();
		expect(h.preview(SOURCE)).toBeDefined();
		expect(h.readText(NOTE)).toBe(original);

		h.drop(NOTE, ["Angebot.docx"]);
		h.emit("create", SOURCE);
		await h.settle();
		expect(h.readText(NOTE)).toBe(original);
	});

	it("leaves the note unchanged and renders nothing extra after drop, render, embed, reconcile and a repeated insertion", async () => {
		h = createHarness();
		await h.start();
		h.putFile(NOTE, "![[Angebot.docx]]\n");

		h.drop(NOTE, ["Angebot.docx"]);
		h.createSource(SOURCE);
		await h.settle();
		const embedded = "[[Angebot.docx]]\n![[Angebot.docx.png]]\n";
		expect(h.readText(NOTE)).toBe(embedded);
		expect(h.renderer.calls).toHaveLength(1);

		// Reconcile pass.
		h.setEnabled(false);
		h.setEnabled(true);
		await h.advance(120_000);
		await h.drain();

		// Repeated insertion.
		h.drop(NOTE, ["Angebot.docx"]);
		h.emit("create", SOURCE);
		await h.settle();
		await h.drain();

		expect(h.readText(NOTE)).toBe(embedded);
		expect(h.renderer.calls).toHaveLength(1);
	});
});
