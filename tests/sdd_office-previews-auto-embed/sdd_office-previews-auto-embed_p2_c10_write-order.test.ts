import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews-auto-embed p2 c10", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("appends embeds for two documents on one line in write order (a, then b)", async () => {
		h = createHarness();
		const note = "Notizen/M.md";
		h.putFile(note, "Anhänge: ![[a.docx]], ![[b.xlsx]]\n");
		await h.start();

		h.createSource("_resources/a.docx", "document a");
		await h.drain();
		await h.settle();
		h.createSource("_resources/b.xlsx", "sheet b");
		await h.drain();
		await h.settle();

		expect(h.readText(note)).toBe(
			"Anhänge: ![[a.docx]], ![[b.xlsx]]\n![[a.docx.png]]\n![[b.xlsx.png]]\n",
		);
	});
});
