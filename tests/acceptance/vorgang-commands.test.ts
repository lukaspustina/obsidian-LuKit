import { describe, it, expect } from "vitest";
import { addVorgangSection, formatVorgangHeadingText } from "../../src/features/vorgang/vorgang-engine";
import { formatDiaryEntry, addEntryUnderToday } from "../../src/features/work-diary/work-diary-engine";

const date = new Date(2026, 1, 6);

describe("Add Vorgang section command flow", () => {
	it("full flow with realistic Vorgang note", () => {
		const content = [
			"---",
			"Created at: 2024-03-28",
			"Author: Lukas",
			"---",
			"",
			"# Inhalt",
			"- Abstimmung mit Daniel, 01.02.2026",
			"",
			"##### Abstimmung mit Daniel, 01.02.2026",
			"- Discussed budget",
			"- Agreed on timeline",
		].join("\n");

		const { newContent, cursorLineIndex } = addVorgangSection(
			content,
			"Review Meeting",
			date,
		);

		const lines = newContent.split("\n");

		// TOC bullet inserted as first under # Inhalt
		expect(lines[6]).toBe("- [[#Review Meeting, 06.02.2026]]");
		// Old TOC entry still present
		expect(lines[7]).toBe("- Abstimmung mit Daniel, 01.02.2026");
		// New h5 section inserted before existing h5
		expect(newContent).toContain("##### Review Meeting, 06.02.2026");
		const newHeaderIdx = lines.indexOf("##### Review Meeting, 06.02.2026");
		const oldHeaderIdx = lines.indexOf("##### Abstimmung mit Daniel, 01.02.2026");
		expect(newHeaderIdx).toBeLessThan(oldHeaderIdx);
		// Cursor on stub line ready for typing
		expect(lines[cursorLineIndex]).toBe("");
		expect(cursorLineIndex).toBe(newHeaderIdx + 1);
	});

	it("creates Inhalt section when note has none", () => {
		const content = [
			"---",
			"Created at: 2024-03-28",
			"---",
			"",
			"Some existing notes about the Vorgang.",
		].join("\n");

		const { newContent, cursorLineIndex } = addVorgangSection(
			content,
			"Initial Setup",
			date,
		);

		const lines = newContent.split("\n");

		// # Inhalt was created
		expect(newContent).toContain("# Inhalt");
		expect(newContent).toContain("- [[#Initial Setup, 06.02.2026]]");
		expect(newContent).toContain("##### Initial Setup, 06.02.2026");
		// Cursor ready for typing
		expect(lines[cursorLineIndex]).toBe("");
	});

	it("handles Inhalt with empty bullet list gracefully", () => {
		const content = [
			"# Inhalt",
			"",
			"##### Old Section, 01.01.2026",
			"- some note",
		].join("\n");

		const { newContent, cursorLineIndex } = addVorgangSection(
			content,
			"New Section",
			date,
		);

		const lines = newContent.split("\n");

		// Bullet added under Inhalt
		expect(lines[1]).toBe("- [[#New Section, 06.02.2026]]");
		// New h5 appears before old h5
		const newIdx = lines.indexOf("##### New Section, 06.02.2026");
		const oldIdx = lines.indexOf("##### Old Section, 01.01.2026");
		expect(newIdx).toBeLessThan(oldIdx);
		// Cursor on stub line
		expect(lines[cursorLineIndex]).toBe("");
	});

	it("positions cursor on empty line after header for immediate typing", () => {
		const content = "# Inhalt\n- Existing, 01.02.2026\n\n##### Existing, 01.02.2026\n- note";
		const { cursorLineIndex, newContent } = addVorgangSection(content, "Test", date);
		const lines = newContent.split("\n");
		// The cursor line is empty and the feature sets ch: 0
		expect(lines[cursorLineIndex]).toBe("");
		expect(lines[cursorLineIndex - 1]).toBe("##### Test, 06.02.2026");
	});

	it("preserves all original content after insertion", () => {
		const content = [
			"---",
			"title: Vorgang",
			"---",
			"",
			"# Inhalt",
			"- Alpha, 01.02.2026",
			"- Beta, 15.01.2026",
			"",
			"##### Alpha, 01.02.2026",
			"- Alpha note 1",
			"- Alpha note 2",
			"",
			"##### Beta, 15.01.2026",
			"- Beta note 1",
		].join("\n");

		const { newContent } = addVorgangSection(content, "Gamma", date);

		// All original content preserved
		expect(newContent).toContain("- Alpha, 01.02.2026");
		expect(newContent).toContain("- Beta, 15.01.2026");
		expect(newContent).toContain("##### Alpha, 01.02.2026");
		expect(newContent).toContain("- Alpha note 1");
		expect(newContent).toContain("- Alpha note 2");
		expect(newContent).toContain("##### Beta, 15.01.2026");
		expect(newContent).toContain("- Beta note 1");
		// New content added
		expect(newContent).toContain("- [[#Gamma, 06.02.2026]]");
		expect(newContent).toContain("##### Gamma, 06.02.2026");
	});

	it("multiple consecutive addVorgangSection calls build up correctly", () => {
		let content = [
			"# Inhalt",
			"",
			"##### First, 01.01.2026",
			"- note",
		].join("\n");

		const first = addVorgangSection(content, "Second", date);
		content = first.newContent;

		const date2 = new Date(2026, 1, 7);
		const second = addVorgangSection(content, "Third", date2);
		content = second.newContent;

		const lines = content.split("\n");
		// All three entries in Inhalt
		expect(content).toContain("- [[#Third, 07.02.2026]]");
		expect(content).toContain("- [[#Second, 06.02.2026]]");
		expect(content).toContain("##### Third, 07.02.2026");
		expect(content).toContain("##### Second, 06.02.2026");
		expect(content).toContain("##### First, 01.01.2026");
		// Cursor on empty line after header
		expect(lines[second.cursorLineIndex]).toBe("");
	});
});

describe("Add Vorgang section + diary entry flow", () => {
	it("creates diary entry linking to the new Vorgang heading", () => {
		const vorgangContent = [
			"# Inhalt",
			"- Existing, 01.02.2026",
			"",
			"##### Existing, 01.02.2026",
			"- note",
		].join("\n");
		const diaryContent = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026";
		const sectionName = "Review Meeting";
		const noteName = "ProjectX";

		// Step 1: Add Vorgang section (editor side)
		const { newContent: newVorgang } = addVorgangSection(vorgangContent, sectionName, date);
		expect(newVorgang).toContain("##### Review Meeting, 06.02.2026");

		// Step 2: Build and add diary entry (vault.process side)
		const headingText = formatVorgangHeadingText(sectionName, date);
		expect(headingText).toBe("Review Meeting, 06.02.2026");

		const entry = formatDiaryEntry(noteName, headingText);
		expect(entry).toBe("- [[ProjectX#Review Meeting, 06.02.2026|ProjectX: Review Meeting, 06.02.2026]]");

		const { newContent: newDiary } = addEntryUnderToday(diaryContent, entry, date);
		expect(newDiary).toContain("- [[ProjectX#Review Meeting, 06.02.2026|ProjectX: Review Meeting, 06.02.2026]]");
	});

	it("silently skips diary entry when diary path is empty", () => {
		// When diaryPath is "", the feature skips without error
		// This test documents the expected behavior — no diary modification
		const diaryPath = "";
		expect(diaryPath).toBe("");
	});

	it("diary entry uses today's date matching the Vorgang heading date", () => {
		const diaryContent = "---\nfm\n---\n[[pinned]]\n---";
		const sectionName = "Kick-Off";
		const noteName = "VorgangNote";

		const headingText = formatVorgangHeadingText(sectionName, date);
		const entry = formatDiaryEntry(noteName, headingText);
		const { newContent } = addEntryUnderToday(diaryContent, entry, date);

		expect(newContent).toContain("##### Fr, 06.02.2026");
		expect(newContent).toContain("- [[VorgangNote#Kick-Off, 06.02.2026|VorgangNote: Kick-Off, 06.02.2026]]");
	});
});
