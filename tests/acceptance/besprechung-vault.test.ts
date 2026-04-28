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
		expect(result.missing).toEqual([]);
		expect(result.body).toContain("**Nächste Schritte**");
		expect(result.body).toContain("**Zusammenfassung**");
		expect(result.body).toContain("- Do the thing");
		expect(result.body).toContain("- We decided X");
	});

	it("does not include sections not in the configured list", () => {
		const result = formatBesprechungSummary(MEETING_NOTE);
		expect(result.body).not.toContain("Agenda");
		expect(result.body).not.toContain("Item 1");
	});

	it("returns empty body and full missing list when vault content has no matching sections", () => {
		const content = "### Meine Notizen\n- Just notes";
		const result = formatBesprechungSummary(content);
		expect(result.body).toBe("");
		expect(result.missing).toEqual(["Nächste Schritte", "Zusammenfassung"]);
	});

	it("uses custom section headings from settings", () => {
		const result = formatBesprechungSummary(MEETING_NOTE, ["Agenda"]);
		expect(result.body).toBe("**Agenda**\n- Item 1\n- Item 2");
		expect(result.missing).toEqual([]);
	});

	it("extracts sections in configured order regardless of note order", () => {
		const content = "### Beta\n- B content\n### Alpha\n- A content";
		const result = formatBesprechungSummary(content, ["Alpha", "Beta"]);
		expect(result.body).toBe("**Alpha**\n- A content\n\n**Beta**\n- B content");
	});

	it("returns empty body and empty missing when configured section headings list is empty", () => {
		const result = formatBesprechungSummary(MEETING_NOTE, []);
		expect(result.body).toBe("");
		expect(result.missing).toEqual([]);
	});

	it("formats result as insert-ready text with no leading/trailing blank lines", () => {
		const result = formatBesprechungSummary(MEETING_NOTE);
		expect(result.body.startsWith("\n")).toBe(false);
		expect(result.body.endsWith("\n")).toBe(false);
	});
});
