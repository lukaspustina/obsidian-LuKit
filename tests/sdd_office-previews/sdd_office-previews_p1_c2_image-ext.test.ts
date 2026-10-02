import { describe, it, expect } from "vitest";
import { imageExtFor } from "../../src/features/office-previews/office-previews-engine";

describe("SDD office-previews p1 c2", () => {
	it("chooses jpg for an upper-case PPTX source", () => {
		expect(imageExtFor("Folien.PPTX")).toBe("jpg");
	});

	it("chooses png for odt and xlsx, jpg for key", () => {
		expect(imageExtFor("a.odt")).toBe("png");
		expect(imageExtFor("b.xlsx")).toBe("png");
		expect(imageExtFor("c.key")).toBe("jpg");
	});

	it("chooses jpg for every presentation type and png for the rest", () => {
		for (const ext of ["pptx", "ppt", "key"]) {
			expect(imageExtFor(`Dir/x.${ext}`)).toBe("jpg");
			expect(imageExtFor(`Dir/x.${ext.toUpperCase()}`)).toBe("jpg");
		}
		for (const ext of ["docx", "doc", "xlsx", "xls", "pages", "numbers", "odt"]) {
			expect(imageExtFor(`Dir/x.${ext}`)).toBe("png");
			expect(imageExtFor(`Dir/x.${ext.toUpperCase()}`)).toBe("png");
		}
	});
});
