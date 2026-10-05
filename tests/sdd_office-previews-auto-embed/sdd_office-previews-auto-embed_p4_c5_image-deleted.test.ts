import { afterEach, describe, expect, it, vi } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const SOURCE = "_resources/Angebot.docx";
const NOTE_A = "Notizen/A.md";
const NOTE_B = "Notizen/B.md";

describe("SDD office-previews-auto-embed p4 c5", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
		vi.restoreAllMocks();
	});

	it("skips the note reached after the image was deleted and completes without throwing", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		h = createHarness();
		await h.start();
		h.putFile(NOTE_A, "first [[Angebot.docx]]\n");
		h.putFile(NOTE_B, "second [[Angebot.docx]]\n");
		const real = h.vaultProcess.getMockImplementation();
		if (!real) throw new Error("vault.process has no implementation");
		h.vaultProcess.mockImplementationOnce(async (...args: unknown[]) => {
			// Both notes are already listed; the image disappears before the pass reaches B.
			h.deleteFile(h.mirror(SOURCE));
			return real(...args);
		});

		h.createSource(SOURCE);
		await h.drain();
		await h.settle();

		expect(h.readText(NOTE_A)).toBe("first [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(h.readText(NOTE_B)).toBe("second [[Angebot.docx]]\n");
		expect(h.vaultProcess.mock.calls.length).toBe(1);
		expect(warn).not.toHaveBeenCalled();
	});
});
