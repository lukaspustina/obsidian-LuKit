import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

const SOURCE = "_resources/Angebot.docx";
const NOTE = "Notizen/M.md";

describe("SDD office-previews-auto-embed p3 c11", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("edits notes on command for a preview that only arrived via sync, whereas the arrival alone did not", async () => {
		h = createHarness();
		h.putFile(NOTE, "Siehe [[Angebot.docx]]\n");
		await h.start();

		const content = `content of ${SOURCE}`;
		h.addSource(SOURCE, content);
		h.putFile(h.mirror(SOURCE), markedPreview(SOURCE, sha256Of(content)));
		h.emit("create", h.mirror(SOURCE));
		await h.drain();
		await h.settle();

		expect(h.renderer.renderedPaths()).toEqual([]);
		expect(h.vaultProcess.mock.calls.length).toBe(0);
		expect(h.readText(NOTE)).toBe("Siehe [[Angebot.docx]]\n");

		await h.runCommand("office-previews-embed-missing");
		await h.settle();

		expect(h.renderer.renderedPaths()).toEqual([]);
		expect(h.readText(NOTE)).toBe("Siehe [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(h.vaultProcess.mock.calls.length).toBe(1);
	});
});
