import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

const NOTE = "Notizen/M.md";
const SOURCE = "_resources/Angebot.docx";
const EMBED = "![Angebot.docx.png](_previews/_resources/Angebot.docx.png)";

describe("SDD office-previews-auto-embed p4 c4", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("inserts no second embed when a dropped source's preview is written and the note already embeds it in Markdown form", async () => {
		h = createHarness({ linkStyle: "markdown" });
		const content = `![[Angebot.docx]]\n${EMBED}\n`;
		h.putFile(NOTE, content);
		h.putFile(h.mirror(SOURCE), markedPreview(SOURCE, sha256Of("stale content")));
		const ed = h.openNote(NOTE);
		await h.start();

		h.drop(NOTE, ["Angebot.docx"]);
		await h.advance(1000);
		h.createSource(SOURCE);
		await h.settle();

		expect(h.renderer.renderedPaths()).toEqual([SOURCE]);
		expect(h.previewMarker(SOURCE)?.sha256).toBe(sha256Of(`content of ${SOURCE}`));
		expect(ed.getValue()).toBe(content);
		expect(ed.getValue().split(EMBED).length - 1).toBe(1);
	});
});
