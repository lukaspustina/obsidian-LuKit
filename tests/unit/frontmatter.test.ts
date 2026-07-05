import { describe, it, expect } from "vitest";
import { addTagToFrontmatter, SECTION_NOTE_TAGS } from "../../src/shared/frontmatter";
import { formatCreatedAtTimestamp } from "../../src/features/vorgang/vorgang-engine";

describe("addTagToFrontmatter", () => {
	it("creates a tags array when none exists", () => {
		const fm: Record<string, unknown> = {};
		addTagToFrontmatter(fm, "Vorgang");
		expect(fm.tags).toEqual(["Vorgang"]);
	});

	it("converts a string tag into an array with both values", () => {
		const fm: Record<string, unknown> = { tags: "Projekt" };
		addTagToFrontmatter(fm, "Vorgang");
		expect(fm.tags).toEqual(["Projekt", "Vorgang"]);
	});

	it("appends to an existing array", () => {
		const fm: Record<string, unknown> = { tags: ["Projekt"] };
		addTagToFrontmatter(fm, "Vorgang");
		expect(fm.tags).toEqual(["Projekt", "Vorgang"]);
	});

	it("is idempotent for string and array", () => {
		const fmArray: Record<string, unknown> = { tags: ["Vorgang"] };
		addTagToFrontmatter(fmArray, "Vorgang");
		expect(fmArray.tags).toEqual(["Vorgang"]);

		const fmString: Record<string, unknown> = { tags: "Vorgang" };
		addTagToFrontmatter(fmString, "Vorgang");
		expect(fmString.tags).toBe("Vorgang");
	});
});

describe("SECTION_NOTE_TAGS", () => {
	it("contains the four section-note types", () => {
		expect([...SECTION_NOTE_TAGS].sort()).toEqual(["Bestellung", "Bewerbung", "Person", "Vorgang"]);
	});
});

describe("formatCreatedAtTimestamp", () => {
	it("formats as YYYY-MM-DD HH:mm:ss with zero padding", () => {
		expect(formatCreatedAtTimestamp(new Date(2026, 6, 5, 9, 3, 7))).toBe("2026-07-05 09:03:07");
	});
});
