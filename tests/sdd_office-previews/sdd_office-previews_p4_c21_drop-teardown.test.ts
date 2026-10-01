import { afterEach, describe, expect, it, vi } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p4 c21", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("clears timers and inserts nothing when unloaded while a drop is pending", async () => {
		h = createHarness();
		const note1 = "Notizen/N.md";
		const note2 = "Notizen/M.md";
		h.putFile(note1, "Intro\n![[Angebot.docx]]\n");
		const original2 = "Intro\n![[Bericht.docx]]\n";
		h.putFile(note2, original2);
		const ed1 = h.openNote(note1);
		const ed2 = h.openNote(note2);
		await h.start();

		// Control: a drop before the unload is embedded.
		h.drop(note1, ["Angebot.docx"]);
		h.createSource("_resources/Angebot.docx");
		await h.settle();
		expect(ed1.getValue()).toBe("Intro\n[[Angebot.docx]]\n![[Angebot.docx.png]]\n");

		// A drop is pending: matched, render in flight.
		h.renderer.hold();
		h.drop(note2, ["Bericht.docx"]);
		h.createSource("_resources/Bericht.docx");
		await h.settle();
		expect(h.renderer.held).toHaveLength(1);

		h.unload();
		expect(vi.getTimerCount()).toBe(0);

		h.renderer.release();
		await h.settle();
		await h.advance(120_000);

		expect(ed2.getValue()).toBe(original2);
		expect(ed2.transactions).toHaveLength(0);
		expect(h.readText(note2)).toBe(original2);
		expect(h.preview("_resources/Bericht.docx")).toBeUndefined();
	});
});
