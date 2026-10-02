import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const NOTE = "Notizen/M.md";
const A = "_resources/Angebot.docx";
const B = "_resources/Budget.xlsx";

describe("SDD office-previews-auto-embed p2 c11", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("does not block the render queue on embedding, serializes note writes on one chain and embeds each preview once in enqueue order", async () => {
		h = createHarness();
		h.putFile(NOTE, "Anhänge: ![[Angebot.docx]], ![[Budget.xlsx]]\n");
		await h.start();

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

		h.createSource(A);
		h.createSource(B);
		await h.drain();
		await h.settle();

		// Both renders ran although the first embedding has not written the note yet.
		expect(h.renderer.calls).toHaveLength(2);
		expect(h.vaultProcess.mock.calls.length).toBe(1);
		expect(h.readText(NOTE)).toBe("Anhänge: ![[Angebot.docx]], ![[Budget.xlsx]]\n");

		// Release writes one at a time until the chain is empty.
		for (let i = 0; i < 10 && (gates.length > 0 || i < 3); i++) {
			const gate = gates.shift();
			if (gate !== undefined) gate();
			await h.settle();
		}

		expect(maxInFlight).toBe(1);
		expect(h.vaultProcess.mock.calls.length).toBe(2);
		// Chain-entry order is render order, which the random jitter decides.
		const embeds = h.renderer.renderedPaths().map((p) => `![[${p.slice(p.lastIndexOf("/") + 1)}.png]]\n`);
		expect(embeds).toHaveLength(2);
		expect(h.readText(NOTE)).toBe("Anhänge: ![[Angebot.docx]], ![[Budget.xlsx]]\n" + embeds.join(""));
	});
});
