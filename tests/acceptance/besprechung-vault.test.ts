import { describe, it, expect } from "vitest";
import { formatBesprechungSummary } from "../../src/features/besprechung/besprechung-engine";

// Simulates content returned by vault.read() for a meeting note
const MEETING_NOTE = [
	"---",
	"created: 2026-01-22T13:30:09.864Z",
	"---",
	"",
	"### Agenda",
	"- Item 1",
	"- Item 2",
	"",
	"### Nächste Schritte",
	"- Do the thing",
	"- Review the code",
	"",
	"### Zusammenfassung",
	"- We decided X",
	"- Everyone agreed Y",
].join("\n");

describe("Besprechung: Add summary command flow", () => {
	it("extracts and formats both default sections", () => {
		const result = formatBesprechungSummary(MEETING_NOTE);
		expect(result).not.toBeNull();
		expect(result).toContain("**Nächste Schritte**");
		expect(result).toContain("**Zusammenfassung**");
		expect(result).toContain("- Do the thing");
		expect(result).toContain("- We decided X");
	});

	it("does not include sections not in the configured list", () => {
		const result = formatBesprechungSummary(MEETING_NOTE);
		expect(result).not.toContain("Agenda");
		expect(result).not.toContain("Item 1");
	});

	it("returns null when vault content has no matching sections", () => {
		const content = "### Meine Notizen\n- Just notes";
		expect(formatBesprechungSummary(content)).toBeNull();
	});

	it("uses custom section headings from settings", () => {
		const result = formatBesprechungSummary(MEETING_NOTE, ["Agenda"]);
		expect(result).toBe("**Agenda**\n- Item 1\n- Item 2");
	});

	it("extracts sections in configured order regardless of note order", () => {
		const content = "### Beta\n- B content\n### Alpha\n- A content";
		const result = formatBesprechungSummary(content, ["Alpha", "Beta"]);
		expect(result).toBe("**Alpha**\n- A content\n\n**Beta**\n- B content");
	});

	it("returns null when configured section headings list is empty", () => {
		expect(formatBesprechungSummary(MEETING_NOTE, [])).toBeNull();
	});

	it("formats result as insert-ready text with no leading/trailing blank lines", () => {
		const result = formatBesprechungSummary(MEETING_NOTE);
		expect(result).not.toBeNull();
		expect(result!.startsWith("\n")).toBe(false);
		expect(result!.endsWith("\n")).toBe(false);
	});
});
