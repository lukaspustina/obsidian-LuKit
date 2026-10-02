import { describe, it, expect } from "vitest";
import {
	isSource,
	SUPPORTED_EXTENSIONS,
} from "../../src/features/office-previews/office-previews-engine";

const FOLDER = "_previews";
const EXPECTED_EXTENSIONS = [
	"docx",
	"doc",
	"xlsx",
	"xls",
	"pptx",
	"ppt",
	"pages",
	"numbers",
	"key",
	"odt",
];

describe("SDD office-previews p1 c3", () => {
	it("lists exactly the 12 supported extensions", () => {
		expect([...SUPPORTED_EXTENSIONS]).toEqual(EXPECTED_EXTENSIONS);
	});

	it("rejects a path below the preview folder", () => {
		expect(isSource("_previews/a.docx", FOLDER)).toBe(false);
		expect(isSource("_previews/Projekte/b.PPTX", FOLDER)).toBe(false);
	});

	it("rejects an unsupported extension", () => {
		expect(isSource("x.PDF", FOLDER)).toBe(false);
		expect(isSource("x.pdf", FOLDER)).toBe(false);
		// ods/odp were dropped: Quick Look never renders them (format experiment).
		expect(isSource("x.ods", FOLDER)).toBe(false);
		expect(isSource("x.odp", FOLDER)).toBe(false);
	});

	it("accepts every supported extension in lower and upper case", () => {
		for (const ext of EXPECTED_EXTENSIONS) {
			expect(isSource(`Projekte/Datei.${ext}`, FOLDER)).toBe(true);
			expect(isSource(`Projekte/Datei.${ext.toUpperCase()}`, FOLDER)).toBe(true);
		}
	});

	it("accepts a source at the vault root", () => {
		expect(isSource("Angebot.docx", FOLDER)).toBe(true);
	});
});
