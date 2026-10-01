import { afterEach, describe, expect, it } from "vitest";
import { createHarness, sha256Of, type Harness } from "../helpers/office-previews-harness";

const NOTE = "Notizen/N.md";
const SOURCE = "_resources/Angebot.docx";

describe("SDD office-previews p4 c1", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("renders a dropped source at once, ignoring failure memory, converts the embed to a link and inserts the preview below", async () => {
		const storage = new Map<string, unknown>();
		storage.set("lukit.officePreviews.failures", {
			[SOURCE]: { sha256: sha256Of(`content of ${SOURCE}`), reason: "exit", at: "2026-01-01T00:00:00.000Z" },
		});
		h = createHarness({ storage });
		h.putFile(NOTE, "text with ![[Angebot.docx]]\n");
		const ed = h.openNote(NOTE);
		await h.start();

		h.drop(NOTE, ["Angebot.docx"]);
		await h.advance(1000);
		h.createSource(SOURCE);
		await h.settle();

		expect(h.renderer.renderedPaths()).toEqual([SOURCE]);
		expect(h.preview(SOURCE)).toBeDefined();
		expect(ed.getValue()).toBe("text with [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
	});
});
