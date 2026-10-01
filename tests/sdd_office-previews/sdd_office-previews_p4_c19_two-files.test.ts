import { afterEach, describe, expect, it } from "vitest";
import { createHarness, tinyPng, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p4 c19", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("matches both files of one drop and gives each its own embed", async () => {
		h = createHarness();
		const note = "Notizen/N.md";
		h.putFile(note, "Intro\n![[A.docx]]\n![[B.docx]]\n");
		const ed = h.openNote(note);
		await h.start();

		h.drop(note, ["A.docx", "B.docx"]);
		h.createSource("_resources/A.docx");
		h.createSource("_resources/B.docx");
		await h.settle();

		expect(h.renderer.calls).toHaveLength(2);
		expect(ed.getValue()).toBe("Intro\n[[A.docx]]\n![[A.docx.png]]\n[[B.docx]]\n![[B.docx.png]]\n");
	});

	it("a failed file gets its own Notice while the other is embedded", async () => {
		h = createHarness();
		const note = "Notizen/N.md";
		h.putFile(note, "Intro\n![[A.docx]]\n![[B.docx]]\n");
		const ed = h.openNote(note);
		await h.start();
		h.renderer.result = (abs) => (abs.endsWith("/B.docx") ? { ok: false, reason: "exit" } : { ok: true, bytes: tinyPng() });

		h.drop(note, ["A.docx", "B.docx"]);
		h.createSource("_resources/A.docx");
		h.createSource("_resources/B.docx");
		await h.settle();

		expect(ed.getValue()).toBe("Intro\n[[A.docx]]\n![[A.docx.png]]\n![[B.docx]]\n");
		expect(h.notices().filter((n) => n.includes("fehlgeschlagen"))).toEqual(["Office-Vorschau fehlgeschlagen: B.docx"]);
	});
});
