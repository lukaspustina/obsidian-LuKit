import { describe, it, expect } from "vitest";
import { formatBesprechungSummary } from "../../src/features/besprechung/besprechung-engine";

describe("Add Besprechung summary command flow", () => {
	it("full flow with realistic Besprechungsnotiz content", () => {
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

		// Verify h3 headers are converted to bold
		expect(result).toContain("**Nächste Schritte**");
		expect(result).toContain("**Zusammenfassung**");
		expect(result).not.toContain("### ");

		// Verify Nächste Schritte body is complete
		expect(result).toContain("Peter:");
		expect(result).toContain("- Todo 1");
		expect(result).toContain("- Todo 2");
		expect(result).toContain("- Todo 3");
		expect(result).toContain("Lukas:");
		expect(result).toContain("- Some other Todo 1");
		expect(result).toContain("Follow-up Termine:");
		expect(result).toContain("- Step 3");

		// Verify Zusammenfassung body is complete
		expect(result).toContain("- Peter said this");
		expect(result).toContain("- Lukas said something else");

		// Verify Meine Notizen is excluded
		expect(result).not.toContain("Meine Notizen");
		expect(result).not.toContain("...");

		// Verify sections are separated by a blank line
		expect(result).toContain("\n\n**Zusammenfassung**");
	});

	it("handles content with frontmatter correctly", () => {
		const content = [
			"---",
			"title: Weekly Sync",
			"date: 2026-02-01",
			"tags: [meeting, weekly]",
			"---",
			"### Nächste Schritte",
			"- Action item 1",
			"### Zusammenfassung",
			"- We discussed the roadmap",
		].join("\n");

		const result = formatBesprechungSummary(content);
		expect(result).toBe(
			"**Nächste Schritte**\n- Action item 1\n\n**Zusammenfassung**\n- We discussed the roadmap"
		);
	});

	it("handles content with extra sections (Meine Notizen)", () => {
		const content = [
			"### Nächste Schritte",
			"- Do something",
			"### Zusammenfassung",
			"- Talked about things",
			"### Meine Notizen",
			"- Personal note 1",
			"- Personal note 2",
		].join("\n");

		const result = formatBesprechungSummary(content);
		expect(result).not.toBeNull();
		expect(result).toContain("- Do something");
		expect(result).toContain("- Talked about things");
		expect(result).not.toContain("Personal note");
		expect(result).not.toContain("Meine Notizen");
	});

	it("handles partial data — only Nächste Schritte present", () => {
		const content = [
			"---",
			"type: note",
			"---",
			"### Nächste Schritte",
			"- Follow up with team",
			"- Prepare presentation",
			"### Meine Notizen",
			"- Some private note",
		].join("\n");

		const result = formatBesprechungSummary(content);
		expect(result).toBe(
			"**Nächste Schritte**\n- Follow up with team\n- Prepare presentation"
		);
	});

	it("handles partial data — only Zusammenfassung present", () => {
		const content = [
			"### Meine Notizen",
			"- Private stuff",
			"### Zusammenfassung",
			"- Key decision was made",
		].join("\n");

		const result = formatBesprechungSummary(content);
		expect(result).toBe(
			"**Zusammenfassung**\n- Key decision was made"
		);
	});

	it("returns null when note has no relevant sections", () => {
		const content = [
			"---",
			"type: note",
			"---",
			"### Meine Notizen",
			"- Just personal notes here",
			"### Agenda",
			"- Topic 1",
		].join("\n");

		expect(formatBesprechungSummary(content)).toBeNull();
	});

	it("full flow with custom section headings from settings", () => {
		const content = [
			"---",
			"type: note",
			"---",
			"### Agenda",
			"- Topic 1",
			"- Topic 2",
			"### Decisions",
			"- We decided X",
			"### Nächste Schritte",
			"- Step 1",
			"### Meine Notizen",
			"- Private",
		].join("\n");

		const customHeadings = ["Agenda", "Decisions", "Nächste Schritte"];
		const result = formatBesprechungSummary(content, customHeadings);
		expect(result).not.toBeNull();
		expect(result).toContain("**Agenda**");
		expect(result).toContain("- Topic 1");
		expect(result).toContain("**Decisions**");
		expect(result).toContain("- We decided X");
		expect(result).toContain("**Nächste Schritte**");
		expect(result).toContain("- Step 1");
		expect(result).not.toContain("Meine Notizen");
		expect(result).not.toContain("Private");
	});
});
