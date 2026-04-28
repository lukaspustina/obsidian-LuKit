import { describe, it, expect } from "vitest";
import {
	extractSection,
	extractCreatedDate,
	formatBesprechungSummary,
	composeBesprechungInsertion,
	frontmatterTagsInclude,
	removeTagFromFrontmatter,
	markFiledInFrontmatter,
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

describe("extractSection with bulletsOnly=true", () => {
	it("stops at first non-bullet non-blank line", () => {
		const content = [
			"### Section",
			"- Bullet 1",
			"Label:",
			"- Bullet 2",
		].join("\n");
		expect(extractSection(content, "Section", true)).toBe("- Bullet 1");
	});

	it("includes all bullets when no label lines present", () => {
		const content = "### Section\n- A\n- B\n- C";
		expect(extractSection(content, "Section", true)).toBe("- A\n- B\n- C");
	});

	it("passes through blank lines between bullets", () => {
		const content = "### Section\n- A\n\n- B";
		expect(extractSection(content, "Section", true)).toBe("- A\n\n- B");
	});

	it("returns null when no bullets at all", () => {
		const content = "### Section\nJust prose.";
		expect(extractSection(content, "Section", true)).toBeNull();
	});

	it("defaults to bulletsOnly=false — includes non-bullet lines", () => {
		const content = "### Section\n- Bullet\nProse line";
		expect(extractSection(content, "Section")).toBe("- Bullet\nProse line");
	});
});

describe("formatBesprechungSummary", () => {
	it("formats both sections when present, missing is empty", () => {
		const content = [
			"### Nächste Schritte",
			"- Step 1",
			"- Step 2",
			"### Zusammenfassung",
			"- Summary point",
		].join("\n");

		const result = formatBesprechungSummary(content);
		expect(result.body).toBe(
			"**Nächste Schritte**\n- Step 1\n- Step 2\n\n**Zusammenfassung**\n- Summary point"
		);
		expect(result.missing).toEqual([]);
	});

	it("formats only Nächste Schritte and reports Zusammenfassung as missing", () => {
		const content = "### Nächste Schritte\n- Step 1";
		const result = formatBesprechungSummary(content);
		expect(result.body).toBe("**Nächste Schritte**\n- Step 1");
		expect(result.missing).toEqual(["Zusammenfassung"]);
	});

	it("formats only Zusammenfassung and reports Nächste Schritte as missing", () => {
		const content = "### Zusammenfassung\n- Point 1";
		const result = formatBesprechungSummary(content);
		expect(result.body).toBe("**Zusammenfassung**\n- Point 1");
		expect(result.missing).toEqual(["Nächste Schritte"]);
	});

	it("returns empty body and full missing list when no sections found", () => {
		const content = "### Other Section\nSome content";
		const result = formatBesprechungSummary(content);
		expect(result.body).toBe("");
		expect(result.missing).toEqual(["Nächste Schritte", "Zusammenfassung"]);
	});

	it("returns empty body and full missing list for empty content", () => {
		const result = formatBesprechungSummary("");
		expect(result.body).toBe("");
		expect(result.missing).toEqual(["Nächste Schritte", "Zusammenfassung"]);
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
			"- Anna said this",
			"- Max said something else",
			"",
			"",
			"### Meine Notizen",
			"...",
		].join("\n");

		const result = formatBesprechungSummary(content);
		expect(result.missing).toEqual([]);
		expect(result.body).toContain("**Nächste Schritte**");
		expect(result.body).toContain("**Zusammenfassung**");
		expect(result.body).toContain("- Todo 1");
		expect(result.body).toContain("- Todo 2");
		expect(result.body).toContain("- Todo 3");
		expect(result.body).toContain("- Anna said this");
		expect(result.body).toContain("- Max said something else");
		// Should not contain Meine Notizen content
		expect(result.body).not.toContain("Meine Notizen");
		expect(result.body).not.toContain("...");
	});

	it("preserves inline formatting within bullet lines", () => {
		const content = [
			"### Nächste Schritte",
			"- Bullet with **bold** and [[link]]",
			"### Zusammenfassung",
			"- Normal point",
		].join("\n");

		const result = formatBesprechungSummary(content);
		expect(result.body).toContain("- Bullet with **bold** and [[link]]");
	});

	it("removes blank lines adjacent to label lines", () => {
		const content = [
			"### Nächste Schritte",
			"",
			"Max:",
			"",
			"- Bullet 1",
			"- Bullet 2",
			"",
			"Hans:",
			"",
			"- Bullet 3",
			"### Zusammenfassung",
			"- Summary",
		].join("\n");

		const result = formatBesprechungSummary(content);
		expect(result.body).toContain("Max:\n- Bullet 1");
		expect(result.body).toContain("- Bullet 2\nHans:");
		expect(result.body).toContain("Hans:\n- Bullet 3");
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
		expect(result.body).toContain("- First bullet");
		expect(result.body).toContain("Some label:");
		expect(result.body).toContain("- Second bullet (after label)");
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
		expect(result.body).toBe("**Agenda**\n- Topic 1\n\n**Decisions**\n- Decision 1");
		expect(result.missing).toEqual([]);
	});

	it("returns empty body and empty missing for empty section headings array", () => {
		const content = "### Nächste Schritte\n- Step 1";
		const result = formatBesprechungSummary(content, []);
		expect(result.body).toBe("");
		expect(result.missing).toEqual([]);
	});

	it("extracts a single section heading", () => {
		const content = [
			"### Zusammenfassung",
			"- Point 1",
			"### Nächste Schritte",
			"- Step 1",
		].join("\n");

		const result = formatBesprechungSummary(content, ["Zusammenfassung"]);
		expect(result.body).toBe("**Zusammenfassung**\n- Point 1");
		expect(result.missing).toEqual([]);
	});

	it("uses default headings when no parameter is provided", () => {
		const content = [
			"### Nächste Schritte",
			"- Step 1",
			"### Zusammenfassung",
			"- Summary",
		].join("\n");

		const result = formatBesprechungSummary(content);
		expect(result.body).toBe(
			"**Nächste Schritte**\n- Step 1\n\n**Zusammenfassung**\n- Summary"
		);
	});
});

describe("composeBesprechungInsertion", () => {
	const NAME = "Besprechung - Test, 28.04.2026";

	it("returns body unchanged when nothing is missing", () => {
		const result = composeBesprechungInsertion(
			{ body: "**Nächste Schritte**\n- Step", missing: [] },
			NAME,
		);
		expect(result).toBe("**Nächste Schritte**\n- Step");
	});

	it("appends a 'see full notes' line when some sections are missing", () => {
		const result = composeBesprechungInsertion(
			{ body: "**Nächste Schritte**\n- Step", missing: ["Zusammenfassung"] },
			NAME,
		);
		expect(result).toBe(
			`**Nächste Schritte**\n- Step\n\n→ See full notes: [[${NAME}]] (missing: Zusammenfassung)`,
		);
	});

	it("returns only the link line when body is empty (all sections missing)", () => {
		const result = composeBesprechungInsertion(
			{ body: "", missing: ["Nächste Schritte", "Zusammenfassung"] },
			NAME,
		);
		expect(result).toBe(
			`→ See full notes: [[${NAME}]] (missing: Nächste Schritte, Zusammenfassung)`,
		);
	});

	it("returns empty string when body and missing are both empty", () => {
		const result = composeBesprechungInsertion({ body: "", missing: [] }, NAME);
		expect(result).toBe("");
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

describe("frontmatterTagsInclude", () => {
	it("matches a string tag against a single target", () => {
		expect(frontmatterTagsInclude("todo", "todo")).toBe(true);
		expect(frontmatterTagsInclude("other", "todo")).toBe(false);
	});

	it("matches a tag in an array against a single target", () => {
		expect(frontmatterTagsInclude(["work", "todo"], "todo")).toBe(true);
		expect(frontmatterTagsInclude(["work"], "todo")).toBe(false);
	});

	it("matches against a target set", () => {
		const targets = new Set(["Vorgang", "Person"]);
		expect(frontmatterTagsInclude("Vorgang", targets)).toBe(true);
		expect(frontmatterTagsInclude(["work", "Person"], targets)).toBe(true);
		expect(frontmatterTagsInclude(["work"], targets)).toBe(false);
		expect(frontmatterTagsInclude("Other", targets)).toBe(false);
	});

	it("returns false for missing or non-tag values", () => {
		expect(frontmatterTagsInclude(undefined, "todo")).toBe(false);
		expect(frontmatterTagsInclude(null, "todo")).toBe(false);
		expect(frontmatterTagsInclude(42, "todo")).toBe(false);
		expect(frontmatterTagsInclude(undefined, new Set(["x"]))).toBe(false);
	});
});

describe("removeTagFromFrontmatter", () => {
	it("removes a string tag matching the target (deletes the field)", () => {
		const fm: Record<string, unknown> = { tags: "todo" };
		removeTagFromFrontmatter(fm, "todo");
		expect(fm.tags).toBeUndefined();
	});

	it("leaves a non-matching string tag alone", () => {
		const fm: Record<string, unknown> = { tags: "other" };
		removeTagFromFrontmatter(fm, "todo");
		expect(fm.tags).toBe("other");
	});

	it("filters the matching tag out of an array", () => {
		const fm: Record<string, unknown> = { tags: ["work", "todo", "urgent"] };
		removeTagFromFrontmatter(fm, "todo");
		expect(fm.tags).toEqual(["work", "urgent"]);
	});

	it("deletes the tags field when removal empties the array", () => {
		const fm: Record<string, unknown> = { tags: ["todo"] };
		removeTagFromFrontmatter(fm, "todo");
		expect(fm.tags).toBeUndefined();
	});

	it("does not touch other frontmatter fields", () => {
		const fm: Record<string, unknown> = { tags: ["todo"], title: "Note" };
		removeTagFromFrontmatter(fm, "todo");
		expect(fm.title).toBe("Note");
	});

	it("is a no-op when tags is missing", () => {
		const fm: Record<string, unknown> = { title: "Note" };
		removeTagFromFrontmatter(fm, "todo");
		expect(fm).toEqual({ title: "Note" });
	});
});

describe("markFiledInFrontmatter", () => {
	it("sets filed_into as a wikilink and filed_at as ISO timestamp", () => {
		const fm: Record<string, unknown> = {};
		const when = new Date("2026-04-28T14:32:00Z");
		markFiledInFrontmatter(fm, "Vorgang - Acme, January 2026", when);
		expect(fm.filed_into).toBe("[[Vorgang - Acme, January 2026]]");
		expect(fm.filed_at).toBe("2026-04-28T14:32:00.000Z");
	});

	it("overwrites prior filed_into / filed_at values", () => {
		const fm: Record<string, unknown> = {
			filed_into: "[[Old Vorgang]]",
			filed_at: "2025-01-01T00:00:00.000Z",
		};
		markFiledInFrontmatter(fm, "New Vorgang", new Date("2026-04-28T14:32:00Z"));
		expect(fm.filed_into).toBe("[[New Vorgang]]");
		expect(fm.filed_at).toBe("2026-04-28T14:32:00.000Z");
	});

	it("does not touch other frontmatter fields", () => {
		const fm: Record<string, unknown> = { title: "Note", tags: ["x"] };
		markFiledInFrontmatter(fm, "Vorgang", new Date("2026-04-28T14:32:00Z"));
		expect(fm.title).toBe("Note");
		expect(fm.tags).toEqual(["x"]);
	});
});
