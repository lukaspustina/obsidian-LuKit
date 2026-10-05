import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const SOURCE = "_resources/Angebot.docx";
const RENAMED = "_resources/Angebot neu.docx";
const N1 = "Notizen/M1.md";
const N2 = "Notizen/M2.md";

describe("SDD office-previews-auto-embed p4 c6", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("writes nothing for the old path after a rename, then embeds the current mirror once", async () => {
		h = createHarness();
		await h.start();
		h.putFile(N1, "first [[Angebot.docx]]\n");
		h.putFile(N2, "second [[Angebot.docx]]\n");

		const real = h.vaultProcess.getMockImplementation();
		if (!real) throw new Error("vault.process has no implementation");
		let release: () => void = () => undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		h.vaultProcess.mockImplementationOnce(async (...args: unknown[]) => {
			await gate;
			return real(...args);
		});

		h.createSource(SOURCE);
		await h.drain();
		await h.settle();
		expect(h.vaultProcess.mock.calls.length).toBe(1);

		h.renameSource(SOURCE, RENAMED);
		// Obsidian rewrites the link text of the notes; the harness does not.
		h.putFile(N2, "second [[Angebot neu.docx]]\n");
		release();
		await h.settle();

		// The old pass reached the second note and wrote nothing for the old path.
		expect(h.vaultProcess.mock.calls.length).toBe(1);
		expect(h.readText(N2)).toBe("second [[Angebot neu.docx]]\n");

		h.changeSource(RENAMED, "renamed content");
		await h.drain();
		await h.settle();

		expect(h.exists(h.mirror(RENAMED))).toBe(true);
		expect(h.readText(N2)).toBe("second [[Angebot neu.docx]]\n![[Angebot neu.docx.png]]\n");
	});
});
