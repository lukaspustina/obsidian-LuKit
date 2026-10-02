import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const SOURCE = "_resources/Angebot.docx";
const N1 = "Notizen/M1.md";
const N2 = "Notizen/M2.md";

describe("SDD office-previews-auto-embed p2 c16", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("re-plans on the fresh content when the note changed between listing and write", async () => {
		h = createHarness();
		h.addSource(SOURCE);
		h.putFile(N1, "text with [[Angebot.docx]]\n");
		h.freezeResolvedLinks();
		h.putFile(N1, "Neue erste Zeile\ntext with [[Angebot.docx]]\n");

		await h.start();
		await h.settle();

		expect(h.exists(h.mirror(SOURCE))).toBe(true);
		expect(h.readText(N1)).toBe("Neue erste Zeile\ntext with [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
	});

	it("skips later notes when the source is gone at write time", async () => {
		h = createHarness();
		h.addSource(SOURCE);
		h.putFile(N1, "first [[Angebot.docx]]\n");
		h.putFile(N2, "second [[Angebot.docx]]\n");
		const real = h.vaultProcess.getMockImplementation();
		if (!real) throw new Error("vault.process has no implementation");
		h.vaultProcess.mockImplementationOnce(async (...args: unknown[]) => {
			h.deleteFile(SOURCE);
			return real(...args);
		});

		await h.start();
		await h.settle();

		expect(h.readText(N2)).toBe("second [[Angebot.docx]]\n");
		expect(h.vaultProcess.mock.calls.length).toBe(1);
	});
});
