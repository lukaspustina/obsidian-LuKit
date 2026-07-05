import { describe, expect, it } from "vitest";
import { tocAlreadyLinks } from "../../src/shared/note-structure";

describe("SDD vorgang-merge p1 c15: tocAlreadyLinks parity with vorgangAlreadyLinks fixtures", () => {
	it("detects existing wikilink in # Inhalt regardless of date format", () => {
		const vorgangContent = [
			"# Fakten und Pointer",
			"- something",
			"",
			"# Inhalt",
			"- [[Meeting-A#§ Summary, 01.01.2026|Meeting-A: Summary, 01.01.2026]]",
			"- [[#Other Meeting, 02.01.2026]]",
		].join("\n");

		const result = tocAlreadyLinks(vorgangContent.split("\n"), "Meeting-A");
		expect(result).toBe(true);
	});

	it("detects the date-suffixed anchor bullet the plugin itself writes", () => {
		// formatLinkedBullet("Meeting-B", …) writes `- [[#Meeting-B, 15.01.2026]]`
		const vorgangContent = ["# Inhalt", "- [[#Meeting-B, 15.01.2026]]"].join("\n");

		expect(tocAlreadyLinks(vorgangContent.split("\n"), "Meeting-B")).toBe(true);
		// A different note whose name merely shares the prefix must not match.
		expect(tocAlreadyLinks(vorgangContent.split("\n"), "Meeting")).toBe(false);
	});

	it("returns false for a basename that is not linked", () => {
		const vorgangContent = ["# Inhalt", "- [[#Other Meeting, 02.01.2026]]"].join("\n");

		expect(tocAlreadyLinks(vorgangContent.split("\n"), "Meeting-A")).toBe(false);
	});

	it("returns false for a note without a # Inhalt section", () => {
		const vorgangContent = ["# Fakten und Pointer", "- something"].join("\n");

		expect(tocAlreadyLinks(vorgangContent.split("\n"), "Meeting-A")).toBe(false);
	});
});
