import { describe, it, expect } from "vitest";
import {
	formatBesprechungSummary,
	composeBesprechungInsertion,
} from "../../src/features/besprechung/besprechung-engine";

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

		// Verify h3 headers are converted to bold
		expect(result.body).toContain("**Nächste Schritte**");
		expect(result.body).toContain("**Zusammenfassung**");
		expect(result.body).not.toContain("### ");

		// Verify Nächste Schritte bullets
		expect(result.body).toContain("- Todo 1");
		expect(result.body).toContain("- Todo 2");
		expect(result.body).toContain("- Todo 3");

		// Verify Zusammenfassung body
		expect(result.body).toContain("- Anna said this");
		expect(result.body).toContain("- Max said something else");

		// Verify Meine Notizen is excluded
		expect(result.body).not.toContain("Meine Notizen");
		expect(result.body).not.toContain("...");

		// Verify sections are separated by a blank line
		expect(result.body).toContain("\n\n**Zusammenfassung**");
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
		expect(result.body).toBe(
			"**Nächste Schritte**\n- Action item 1\n\n**Zusammenfassung**\n- We discussed the roadmap"
		);
		expect(result.missing).toEqual([]);
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
		expect(result.missing).toEqual([]);
		expect(result.body).toContain("- Do something");
		expect(result.body).toContain("- Talked about things");
		expect(result.body).not.toContain("Personal note");
		expect(result.body).not.toContain("Meine Notizen");
	});

	it("partial data (only Nächste Schritte) appends a 'see notes' link via composeBesprechungInsertion", () => {
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

		const summary = formatBesprechungSummary(content);
		expect(summary.missing).toEqual(["Zusammenfassung"]);
		expect(summary.body).toBe(
			"**Nächste Schritte**\n- Follow up with team\n- Prepare presentation"
		);

		const composed = composeBesprechungInsertion(summary, "Besprechung - Test, 28.04.2026");
		expect(composed).toBe(
			"**Nächste Schritte**\n- Follow up with team\n- Prepare presentation\n\n→ See full notes: [[Besprechung - Test, 28.04.2026]] (missing: Zusammenfassung)"
		);
	});

	it("partial data (only Zusammenfassung) appends a 'see notes' link via composeBesprechungInsertion", () => {
		const content = [
			"### Meine Notizen",
			"- Private stuff",
			"### Zusammenfassung",
			"- Key decision was made",
		].join("\n");

		const summary = formatBesprechungSummary(content);
		expect(summary.missing).toEqual(["Nächste Schritte"]);
		expect(summary.body).toBe("**Zusammenfassung**\n- Key decision was made");

		const composed = composeBesprechungInsertion(summary, "Besprechung - Test, 28.04.2026");
		expect(composed).toBe(
			"**Zusammenfassung**\n- Key decision was made\n\n→ See full notes: [[Besprechung - Test, 28.04.2026]] (missing: Nächste Schritte)"
		);
	});

	it("no relevant sections produces a link-only insertion (no abort)", () => {
		const content = [
			"---",
			"type: note",
			"---",
			"### Meine Notizen",
			"- Just personal notes here",
			"### Agenda",
			"- Topic 1",
		].join("\n");

		const summary = formatBesprechungSummary(content);
		expect(summary.body).toBe("");
		expect(summary.missing).toEqual(["Nächste Schritte", "Zusammenfassung"]);

		const composed = composeBesprechungInsertion(summary, "Besprechung - Empty, 28.04.2026");
		expect(composed).toBe(
			"→ See full notes: [[Besprechung - Empty, 28.04.2026]] (missing: Nächste Schritte, Zusammenfassung)"
		);
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
		expect(result.missing).toEqual([]);
		expect(result.body).toContain("**Agenda**");
		expect(result.body).toContain("- Topic 1");
		expect(result.body).toContain("**Decisions**");
		expect(result.body).toContain("- We decided X");
		expect(result.body).toContain("**Nächste Schritte**");
		expect(result.body).toContain("- Step 1");
		expect(result.body).not.toContain("Meine Notizen");
		expect(result.body).not.toContain("Private");
	});
});
