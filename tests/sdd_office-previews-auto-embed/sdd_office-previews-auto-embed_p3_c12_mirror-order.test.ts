import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

const NOTE = "Notizen/M.md";
const SRC_B = "_resources/b.xlsx";
const SRC_A = "_resources/a.docx";
const COMMAND = "office-previews-embed-missing";

describe("SDD office-previews-auto-embed p3 c12", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("embeds several documents of one line in ascending mirror-path order and is idempotent", async () => {
		h = createHarness();
		h.putFile(NOTE, "Anhänge: ![[a.docx]], ![[b.xlsx]]\n");
		for (const src of [SRC_B, SRC_A]) {
			h.addSource(src);
			h.putFile(h.mirror(src), markedPreview(src, sha256Of(`content of ${src}`)));
		}
		await h.start();

		await h.runCommand(COMMAND);
		await h.settle();

		const expected = "Anhänge: ![[a.docx]], ![[b.xlsx]]\n![[a.docx.png]]\n![[b.xlsx.png]]\n";
		expect(h.readText(NOTE)).toBe(expected);

		await h.runCommand(COMMAND);
		await h.settle();

		expect(h.readText(NOTE)).toBe(expected);
	});
});
