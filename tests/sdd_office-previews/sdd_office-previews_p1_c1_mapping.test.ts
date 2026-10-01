import { describe, it, expect } from "vitest";
import { mirrorPath } from "../../src/features/office-previews/office-previews-engine";

describe("SDD office-previews p1 c1", () => {
	it("maps a nested docx source to a png mirror path keeping the directory structure", () => {
		expect(mirrorPath("Projekte/_resources/Angebot.docx", "_previews")).toBe(
			"_previews/Projekte/_resources/Angebot.docx.png",
		);
	});

	it("maps an upper-case PPTX source to a jpg mirror path keeping the extension case", () => {
		expect(mirrorPath("Folien.PPTX", "_previews")).toBe("_previews/Folien.PPTX.jpg");
	});
});
