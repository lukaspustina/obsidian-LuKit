import { describe, it, expect } from "vitest";
import {
	extractSection,
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
			"Peter:",
			"- Todo 1",
			"- Todo 2",
			"- Todo 3",
			"",
			"Lukas:",
			"- Some other Todo 1",
			"- Some other Todo 2",
			"- Some other Todo 3",
			"",
			"Follow-up Termine:",
			"- Step 1",
			"- Step 2",
			"- Step 3",
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
		expect(result).toContain("Peter:");
		expect(result).toContain("- Todo 1");
		expect(result).toContain("Follow-up Termine:");
		expect(result).toContain("- Peter said this");
		expect(result).toContain("- Lukas said something else");
		// Should not contain Meine Notizen content
		expect(result).not.toContain("Meine Notizen");
		expect(result).not.toContain("...");
	});

	it("preserves formatting within sections", () => {
		const content = [
			"### Nächste Schritte",
			"**Bold text**",
			"- Bullet with [[link]]",
			"### Zusammenfassung",
			"Normal text",
		].join("\n");

		const result = formatBesprechungSummary(content);
		expect(result).toContain("**Bold text**");
		expect(result).toContain("- Bullet with [[link]]");
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
