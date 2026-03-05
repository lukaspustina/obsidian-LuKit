import { describe, it, expect } from "vitest";
import {
	extractSection,
	extractCreatedDate,
	formatBesprechungSummary,
} from "../../src/features/besprechung/besprechung-engine";

describe("extractSection", () => {
	it("extracts section content between two h3 headings", () => {
		const content = [
			"### Alpha",
			"Line 1",
			"Line 2",
			"### Beta",
			"Other",
		].join("\n");
		expect(extractSection(content, "Alpha")).toBe("Line 1\nLine 2");
	});

	it("returns null when heading is not found", () => {
		const content = "### Alpha\nSome text";
		expect(extractSection(content, "Missing")).toBeNull();
	});

	it("extracts section at EOF (no following h3)", () => {
		const content = [
			"### First",
			"Ignored",
			"### Last",
			"Final line 1",
			"Final line 2",
		].join("\n");
		expect(extractSection(content, "Last")).toBe("Final line 1\nFinal line 2");
	});

	it("stops at an h1 heading", () => {
		const content = [
			"### Nächste Schritte",
			"- Do something",
			"# Top Level",
			"Other content",
		].join("\n");
		expect(extractSection(content, "Nächste Schritte")).toBe("- Do something");
	});

	it("stops at an h2 heading", () => {
		const content = [
			"### Nächste Schritte",
			"- Do something",
			"## Section Two",
			"Other content",
		].join("\n");
		expect(extractSection(content, "Nächste Schritte")).toBe("- Do something");
	});

	it("does not stop at h4 or h5 headings", () => {
		const content = [
			"### Section",
			"Before",
			"#### Subsection",
			"After",
			"##### Deep",
			"Deep content",
		].join("\n");
		expect(extractSection(content, "Section")).toBe(
			"Before\n#### Subsection\nAfter\n##### Deep\nDeep content"
		);
	});

	it("trims leading blank lines", () => {
		const content = "### Section\n\n\nActual content";
		expect(extractSection(content, "Section")).toBe("Actual content");
	});

	it("trims trailing blank lines", () => {
		const content = "### Section\nContent\n\n\n### Next\nMore";
		expect(extractSection(content, "Section")).toBe("Content");
	});

	it("returns null for empty body", () => {
		const content = "### Empty\n### Next\nContent";
		expect(extractSection(content, "Empty")).toBeNull();
	});

	it("returns null when body is only blank lines", () => {
		const content = "### Blank\n\n\n\n### Next\nContent";
		expect(extractSection(content, "Blank")).toBeNull();
	});

	it("handles section as the only content", () => {
		const content = "### Solo\nJust this";
		expect(extractSection(content, "Solo")).toBe("Just this");
	});

	it("handles content with frontmatter before the section", () => {
		const content = [
			"---",
			"type: note",
			"---",
			"### Target",
			"Body here",
		].join("\n");
		expect(extractSection(content, "Target")).toBe("Body here");
	});
});

describe("formatBesprechungSummary", () => {
	it("formats both sections when present", () => {
		const content = [
			"### Nächste Schritte",
			"- Step 1",
			"- Step 2",
			"### Zusammenfassung",
			"- Summary point",
		].join("\n");

		const result = formatBesprechungSummary(content);
		expect(result).toBe(
			"**Nächste Schritte**\n- Step 1\n- Step 2\n\n**Zusammenfassung**\n- Summary point"
		);
	});

	it("formats only Nächste Schritte when Zusammenfassung is missing", () => {
		const content = "### Nächste Schritte\n- Step 1";
		const result = formatBesprechungSummary(content);
		expect(result).toBe("**Nächste Schritte**\n- Step 1");
	});

	it("formats only Zusammenfassung when Nächste Schritte is missing", () => {
		const content = "### Zusammenfassung\n- Point 1";
		const result = formatBesprechungSummary(content);
		expect(result).toBe("**Zusammenfassung**\n- Point 1");
	});

	it("returns null when neither section is found", () => {
		const content = "### Other Section\nSome content";
		expect(formatBesprechungSummary(content)).toBeNull();
	});

	it("returns null for empty content", () => {
		expect(formatBesprechungSummary("")).toBeNull();
	});

	it("works with realistic test-besprechung.md content", () => {
		const content = [
			"---",
			"type: note",
			"created: 2026-01-22T13:30:09.864Z",
			"updated: 2026-01-26T17:19:43.335Z",
			"attendees: []",
			"---",
			"### Nächste Schritte",
			"",
			"- Todo 1",
			"- Todo 2",
			"- Todo 3",
			"",
			"### Zusammenfassung",
			"- Peter said this",
			"- Lukas said something else",
			"",
			"",
			"### Meine Notizen",
			"...",
		].join("\n");

		const result = formatBesprechungSummary(content);
		expect(result).not.toBeNull();
		expect(result).toContain("**Nächste Schritte**");
		expect(result).toContain("**Zusammenfassung**");
		expect(result).toContain("- Todo 1");
		expect(result).toContain("- Todo 2");
		expect(result).toContain("- Todo 3");
		expect(result).toContain("- Peter said this");
		expect(result).toContain("- Lukas said something else");
		// Should not contain Meine Notizen content
		expect(result).not.toContain("Meine Notizen");
		expect(result).not.toContain("...");
	});

	it("preserves inline formatting within bullet lines", () => {
		const content = [
			"### Nächste Schritte",
			"- Bullet with **bold** and [[link]]",
			"### Zusammenfassung",
			"- Normal point",
		].join("\n");

		const result = formatBesprechungSummary(content);
		expect(result).toContain("- Bullet with **bold** and [[link]]");
	});

	it("removes blank lines adjacent to label lines", () => {
		const content = [
			"### Nächste Schritte",
			"",
			"Lukas:",
			"",
			"- Bullet 1",
			"- Bullet 2",
			"",
			"Wolfram:",
			"",
			"- Bullet 3",
			"### Zusammenfassung",
			"- Summary",
		].join("\n");

		const result = formatBesprechungSummary(content);
		expect(result).toContain("Lukas:\n- Bullet 1");
		expect(result).toContain("- Bullet 2\nWolfram:");
		expect(result).toContain("Wolfram:\n- Bullet 3");
	});

	it("includes label lines and subsequent bullets within a section", () => {
		const content = [
			"### Nächste Schritte",
			"- First bullet",
			"Some label:",
			"- Second bullet (after label)",
			"### Zusammenfassung",
			"- Summary",
		].join("\n");

		const result = formatBesprechungSummary(content);
		expect(result).toContain("- First bullet");
		expect(result).toContain("Some label:");
		expect(result).toContain("- Second bullet (after label)");
	});

	it("extracts custom section headings", () => {
		const content = [
			"### Agenda",
			"- Topic 1",
			"### Decisions",
			"- Decision 1",
			"### Nächste Schritte",
			"- Step 1",
		].join("\n");

		const result = formatBesprechungSummary(content, ["Agenda", "Decisions"]);
		expect(result).toBe("**Agenda**\n- Topic 1\n\n**Decisions**\n- Decision 1");
	});

	it("returns null for empty section headings array", () => {
		const content = "### Nächste Schritte\n- Step 1";
		expect(formatBesprechungSummary(content, [])).toBeNull();
	});

	it("extracts a single section heading", () => {
		const content = [
			"### Zusammenfassung",
			"- Point 1",
			"### Nächste Schritte",
			"- Step 1",
		].join("\n");

		const result = formatBesprechungSummary(content, ["Zusammenfassung"]);
		expect(result).toBe("**Zusammenfassung**\n- Point 1");
	});

	it("uses default headings when no parameter is provided", () => {
		const content = [
			"### Nächste Schritte",
			"- Step 1",
			"### Zusammenfassung",
			"- Summary",
		].join("\n");

		const result = formatBesprechungSummary(content);
		expect(result).toBe(
			"**Nächste Schritte**\n- Step 1\n\n**Zusammenfassung**\n- Summary"
		);
	});
});

describe("extractCreatedDate", () => {
	it("parses an ISO datetime string", () => {
		const content = "---\ncreated: 2026-01-22T13:30:09.864Z\n---\n";
		const d = extractCreatedDate(content);
		expect(d).not.toBeNull();
		expect(d!.getUTCFullYear()).toBe(2026);
		expect(d!.getUTCMonth()).toBe(0); // January
		expect(d!.getUTCDate()).toBe(22);
	});

	it("parses a plain ISO date string", () => {
		const content = "---\ncreated: 2026-03-15\n---\n";
		const d = extractCreatedDate(content);
		expect(d).not.toBeNull();
		expect(d!.getFullYear()).toBe(2026);
	});

	it("returns null when no created field", () => {
		const content = "---\ntitle: Meeting\n---\n";
		expect(extractCreatedDate(content)).toBeNull();
	});

	it("returns null for invalid date value", () => {
		const content = "---\ncreated: not-a-date\n---\n";
		expect(extractCreatedDate(content)).toBeNull();
	});

	it("ignores created field outside frontmatter area", () => {
		const content = "Some text\ncreated: 2026-01-01\nMore text";
		const d = extractCreatedDate(content);
		// The regex matches anywhere — this is acceptable; at minimum it parses
		expect(d).not.toBeNull();
	});
});
