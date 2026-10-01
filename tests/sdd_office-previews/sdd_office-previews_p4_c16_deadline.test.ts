import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const DEADLINE_MS = 60_000;

describe("SDD office-previews p4 c16", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("inserts nothing when the preview appears after the deadline, and later drops still work", async () => {
		h = createHarness();
		const note = "Notizen/N.md";
		const original = "Intro\n![[Angebot.docx]]\n";
		h.putFile(note, original);
		const ed = h.openNote(note);
		const note2 = "Notizen/M.md";
		h.putFile(note2, "Intro\n![[Bericht.docx]]\n");
		const ed2 = h.openNote(note2);
		await h.start();

		h.renderer.hold();
		h.drop(note, ["Angebot.docx"]);
		h.createSource("_resources/Angebot.docx");
		await h.settle();
		expect(h.renderer.calls).toHaveLength(1);

		await h.advance(DEADLINE_MS + 1_000);
		h.renderer.release();
		await h.settle();
		expect(ed.getValue()).toBe(original);
		expect(ed.transactions).toHaveLength(0);

		// Control: a drop that renders in time is still embedded.
		h.renderer.unhold();
		h.drop(note2, ["Bericht.docx"]);
		h.createSource("_resources/Bericht.docx");
		await h.settle();
		expect(ed2.getValue()).toBe("Intro\n[[Bericht.docx]]\n![[Bericht.docx.png]]\n");
		expect(ed.getValue()).toBe(original);
	});

	it("a failure before the deadline yields one Notice and nothing later", async () => {
		h = createHarness();
		const note = "Notizen/N.md";
		const original = "Intro\n![[Angebot.docx]]\n";
		h.putFile(note, original);
		const ed = h.openNote(note);
		await h.start();

		h.renderer.hold();
		h.drop(note, ["Angebot.docx"]);
		h.createSource("_resources/Angebot.docx");
		await h.settle();
		await h.advance(30_000);
		h.renderer.release({ ok: false, reason: "exit" });
		await h.settle();
		await h.advance(DEADLINE_MS * 2);

		expect(h.notices().filter((n) => n.includes("fehlgeschlagen"))).toEqual(["Office-Vorschau fehlgeschlagen: Angebot.docx"]);
		expect(ed.getValue()).toBe(original);
	});

	it("a success before the deadline inserts exactly once and the deadline does not undo it", async () => {
		h = createHarness();
		const note = "Notizen/N.md";
		h.putFile(note, "Intro\n![[Angebot.docx]]\n");
		const ed = h.openNote(note);
		await h.start();

		h.renderer.hold();
		h.drop(note, ["Angebot.docx"]);
		h.createSource("_resources/Angebot.docx");
		await h.settle();
		await h.advance(30_000);
		h.renderer.release();
		await h.settle();
		await h.advance(DEADLINE_MS * 2);

		expect(ed.getValue()).toBe("Intro\n[[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(ed.transactions).toHaveLength(1);
		expect(h.notices().filter((n) => n.includes("fehlgeschlagen"))).toHaveLength(0);
	});
});
