import { describe, it, expect } from "vitest";
import {
	extractWikilinkTarget,
	stripTrailingBrackets,
	appendSectionAt,
} from "../../src/shared/note-structure";

describe("extractWikilinkTarget", () => {
	it("extracts bare anchor target", () => {
		expect(extractWikilinkTarget("- [[#Besprechung - Foo, 19.03.2026]]")).toBe(
			"Besprechung - Foo, 19.03.2026",
		);
	});

	it("extracts file link target", () => {
		expect(extractWikilinkTarget("- [[Besprechung - Foo, 19.03.2026]]")).toBe(
			"Besprechung - Foo, 19.03.2026",
		);
	});

	it("extracts target before heading anchor", () => {
		expect(extractWikilinkTarget("- [[NoteName#Section]]")).toBe("NoteName");
	});

	it("extracts target before display pipe", () => {
		expect(extractWikilinkTarget("- [[NoteName|Display]]")).toBe("NoteName");
	});

	it("strips folder path from target", () => {
		expect(extractWikilinkTarget("- [[Besprechungen/Note]]")).toBe("Note");
	});

	it("strips .md extension from target", () => {
		expect(extractWikilinkTarget("- [[Folder/Note.md|Display]]")).toBe("Note");
	});

	it("returns null when no wikilink present", () => {
		expect(extractWikilinkTarget("- plain text bullet")).toBeNull();
	});

	it("matches duplicate-detection use case (TS-06)", () => {
		// Bullet from Vorgang TOC contains a wikilink to Meeting-A. The new
		// candidate is also Meeting-A. Even with date-resolution drift in the
		// rendered bullet text, the parsed target matches.
		const bullet = "- [[Meeting-A#§ Summary, 01.01.2026|Meeting-A: Summary, 01.01.2026]]";
		expect(extractWikilinkTarget(bullet)).toBe("Meeting-A");
	});
});

describe("stripTrailingBrackets", () => {
	it("strips trailing ]]", () => {
		expect(stripTrailingBrackets("Name, 19.03.2026]]")).toBe("Name, 19.03.2026");
	});

	it("strips multiple trailing ]", () => {
		expect(stripTrailingBrackets("Foo]]]")).toBe("Foo");
	});

	it("leaves strings without trailing brackets unchanged", () => {
		expect(stripTrailingBrackets("Plain text")).toBe("Plain text");
	});

	it("does not strip leading or middle brackets", () => {
		expect(stripTrailingBrackets("[[Name, 19.03.2026]]")).toBe("[[Name, 19.03.2026");
	});
});

describe("appendSectionAt", () => {
	it("inserts header + body at index when preceding line is non-blank", () => {
		const lines = ["# Inhalt", "- bullet"];
		const result = appendSectionAt(lines, 2, "##### New", ["- body"]);
		expect(result.lines).toEqual(["# Inhalt", "- bullet", "", "##### New", "- body", ""]);
	});

	it("inserts header without leading blank when preceding line is blank", () => {
		const lines = ["##### Existing", "- body", ""];
		const result = appendSectionAt(lines, 3, "##### New", ["- body"]);
		expect(result.lines).toEqual(["##### Existing", "- body", "", "##### New", "- body", ""]);
	});

	it("places cursor on trailing blank when body is present", () => {
		const lines = ["# Inhalt"];
		const result = appendSectionAt(lines, 1, "##### New", ["- body line"]);
		// segment: ["", "##### New", "- body line", ""] starting at index 1
		// trailing blank index = 1 + 3 = 4
		expect(result.cursorLineIndex).toBe(4);
	});

	it("places cursor on first blank after header when body is absent", () => {
		const lines = ["# Inhalt"];
		const result = appendSectionAt(lines, 1, "##### New", []);
		// segment: ["", "##### New", "", "", ""] at end of file (3 trailing blanks)
		// header at index 2, cursor at 3
		expect(result.cursorLineIndex).toBe(3);
	});

	it("adds extra trailing blank at end of file (no body)", () => {
		const lines = ["preceding"];
		const result = appendSectionAt(lines, 1, "##### New", []);
		// 3 trailing blanks at EOF when no body
		expect(result.lines).toEqual(["preceding", "", "##### New", "", "", ""]);
	});

	it("does not mutate the input array", () => {
		const lines = ["# Inhalt"];
		const before = [...lines];
		appendSectionAt(lines, 1, "##### New", ["- body"]);
		expect(lines).toEqual(before);
	});
});
