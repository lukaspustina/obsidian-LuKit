import { afterEach, describe, expect, it, vi } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews-auto-embed p2 c13", () => {
	let h: Harness;

	afterEach(() => {
		vi.restoreAllMocks();
		h.dispose();
	});

	it("continues with the remaining notes, logs one path-free line and records no failure when one note write rejects", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		h = createHarness();
		await h.start();
		const notes = ["Notizen/A.md", "Notizen/B.md", "Notizen/C.md"];
		for (const n of notes) h.putFile(n, "Siehe [[Angebot.docx]]\n");
		h.vaultProcess.mockRejectedValueOnce(new Error("disk full"));

		h.createSource("_resources/Angebot.docx");
		await h.drain();
		await h.settle();

		const embedded = "Siehe [[Angebot.docx]]\n![[Angebot.docx.png]]\n";
		const untouched = "Siehe [[Angebot.docx]]\n";
		const contents = notes.map((n) => h.readText(n));
		expect(contents.filter((c) => c === embedded)).toHaveLength(2);
		expect(contents.filter((c) => c === untouched)).toHaveLength(1);

		const lines = warn.mock.calls
			.map((c) => String(c[0]))
			.filter((l) => l.startsWith("LuKit office previews: "));
		expect(lines).toHaveLength(1);
		expect(lines[0]).not.toContain("/");
		expect(lines[0]).not.toContain(".md");

		expect((await h.status()).failed).toBe(0);
	});
});
