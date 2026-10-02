import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

const NOTE = "Notizen/M.md";
const A = "_resources/Angebot.docx";
const B = "_resources/Budget.xlsx";
const LINE = "Anhänge: ![[Angebot.docx]], ![[Budget.xlsx]]\n";

const countOf = (text: string, needle: string): number => text.split(needle).length - 1;

describe("SDD office-previews-auto-embed p3 c15", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("runs a held backfill and a render's automatic embedding of the same note on one chain and embeds each preview exactly once", async () => {
		h = createHarness();
		h.putFile(NOTE, LINE);
		// A preview left over from an earlier version: current at startup, nothing is rendered or embedded.
		h.addSource(A);
		h.putFile(h.mirror(A), markedPreview(A, sha256Of(`content of ${A}`)));
		await h.start();
		expect(h.readText(NOTE)).toBe(LINE);

		const original = h.vaultProcess.getMockImplementation();
		if (original === undefined) throw new Error("vault.process has no implementation");
		let inFlight = 0;
		let maxInFlight = 0;
		const gates: (() => void)[] = [];
		h.vaultProcess.mockImplementation(async (...args: unknown[]) => {
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			try {
				await new Promise<void>((resolve) => gates.push(resolve));
				return await original(...args);
			} finally {
				inFlight--;
			}
		});

		// The backfill reaches the note and is held inside vault.process.
		void h.plugin.commands.get("office-previews-embed-missing")?.callback?.();
		await h.settle();
		expect(h.vaultProcess.mock.calls.length).toBe(1);

		// While it is held, a new render's automatic embedding targets the same note.
		h.createSource(B);
		await h.drain();
		await h.settle();
		expect(h.renderer.renderedPaths()).toEqual([B]);
		expect(h.vaultProcess.mock.calls.length).toBe(1);

		for (let i = 0; i < 10 && (gates.length > 0 || i < 3); i++) {
			const gate = gates.shift();
			if (gate !== undefined) gate();
			await h.settle();
		}

		expect(maxInFlight).toBe(1);
		expect(h.vaultProcess.mock.calls.length).toBe(2);
		const text = h.readText(NOTE) ?? "";
		expect(text.startsWith(LINE)).toBe(true);
		expect(countOf(text, "![[Angebot.docx.png]]")).toBe(1);
		expect(countOf(text, "![[Budget.xlsx.png]]")).toBe(1);
	});
});
