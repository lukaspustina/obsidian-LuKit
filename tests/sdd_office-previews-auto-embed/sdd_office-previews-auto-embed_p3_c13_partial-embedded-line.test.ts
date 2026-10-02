import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews-auto-embed p3 c13", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("appends only the missing embed after the existing one, and a second run changes nothing", async () => {
		h = createHarness();
		const a = "_resources/a.docx";
		const b = "_resources/b.xlsx";
		const aContent = "document a body";
		const bContent = "sheet b body";
		h.addSource(a, aContent);
		h.addSource(b, bContent);
		h.putFile(h.mirror(a), markedPreview(a, sha256Of(aContent)));
		h.putFile(h.mirror(b), markedPreview(b, sha256Of(bContent)));
		h.putFile("Notizen/M.md", "Anhänge: ![[a.docx]], ![[b.xlsx]]\n![[b.xlsx.png]]\n");
		await h.start();
		await h.settle();

		// Existing previews are current: the startup reconcile renders and writes nothing.
		expect(h.renderer.renderedPaths()).toEqual([]);
		expect(h.vaultProcess.mock.calls).toHaveLength(0);

		await h.runCommand("office-previews-embed-missing");
		await h.settle();

		const expected = "Anhänge: ![[a.docx]], ![[b.xlsx]]\n![[b.xlsx.png]]\n![[a.docx.png]]\n";
		expect(h.readText("Notizen/M.md")).toBe(expected);
		expect(h.vaultProcess.mock.calls).toHaveLength(1);

		await h.runCommand("office-previews-embed-missing");
		await h.settle();

		expect(h.readText("Notizen/M.md")).toBe(expected);
		expect(h.vaultProcess.mock.calls).toHaveLength(1);
	});
});
