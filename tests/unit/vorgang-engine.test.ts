import { describe, it, expect } from "vitest";
import {
	formatGermanDate,
	formatVorgangHeader,
	formatVorgangBullet,
	findInhaltSectionIndex,
	findInhaltBulletRange,
	addVorgangSection,
} from "../../src/features/vorgang/vorgang-engine";

describe("formatGermanDate", () => {
	it("formats a date with zero-padded day and month", () => {
		const date = new Date(2026, 0, 5); // Jan 5
		expect(formatGermanDate(date)).toBe("05.01.2026");
	});

	it("formats double-digit day and month", () => {
		const date = new Date(2026, 11, 25); // Dec 25
		expect(formatGermanDate(date)).toBe("25.12.2026");
	});

	it("handles single-digit month", () => {
		const date = new Date(2026, 1, 6); // Feb 6
		expect(formatGermanDate(date)).toBe("06.02.2026");
	});

	it("uses current date when none provided", () => {
		const result = formatGermanDate();
		expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
	});
});

describe("formatVorgangHeader", () => {
	it("formats header with name and date", () => {
		const date = new Date(2026, 1, 6);
		expect(formatVorgangHeader("Abstimmung", date)).toBe(
			"##### Abstimmung, 06.02.2026",
		);
	});

	it("handles names with special characters", () => {
		const date = new Date(2026, 1, 6);
		expect(formatVorgangHeader("Besprechung: Fibunet", date)).toBe(
			"##### Besprechung: Fibunet, 06.02.2026",
		);
	});
});

describe("formatVorgangBullet", () => {
	it("formats bullet with name and date", () => {
		const date = new Date(2026, 1, 6);
		expect(formatVorgangBullet("Abstimmung", date)).toBe(
			"- [[#Abstimmung, 06.02.2026]]",
		);
	});
});

describe("findInhaltSectionIndex", () => {
	it("finds # Inhalt line", () => {
		const lines = ["# Titel", "", "# Inhalt", "- entry"];
		expect(findInhaltSectionIndex(lines)).toBe(2);
	});

	it("returns -1 when missing", () => {
		const lines = ["# Titel", "", "some content"];
		expect(findInhaltSectionIndex(lines)).toBe(-1);
	});

	it("does not match ## Inhalt", () => {
		const lines = ["## Inhalt", "- entry"];
		expect(findInhaltSectionIndex(lines)).toBe(-1);
	});

	it("does not match # Inhaltlich", () => {
		const lines = ["# Inhaltlich", "- entry"];
		expect(findInhaltSectionIndex(lines)).toBe(-1);
	});

	it("matches # Inhalt with surrounding whitespace", () => {
		const lines = ["  # Inhalt  ", "- entry"];
		expect(findInhaltSectionIndex(lines)).toBe(0);
	});

	it("finds first occurrence when multiple exist", () => {
		const lines = ["# Inhalt", "- a", "# Inhalt", "- b"];
		expect(findInhaltSectionIndex(lines)).toBe(0);
	});
});

describe("findInhaltBulletRange", () => {
	it("finds bullet range after # Inhalt", () => {
		const lines = ["# Inhalt", "- first", "- second", "", "##### Header"];
		const result = findInhaltBulletRange(lines, 0);
		expect(result).toEqual({ firstBullet: 1, afterLastBullet: 3 });
	});

	it("returns null when no bullets exist", () => {
		const lines = ["# Inhalt", "", "##### Header"];
		const result = findInhaltBulletRange(lines, 0);
		expect(result).toBeNull();
	});

	it("handles bullets with blank lines between them", () => {
		const lines = ["# Inhalt", "- first", "", "- second", "", "##### Header"];
		const result = findInhaltBulletRange(lines, 0);
		expect(result).toEqual({ firstBullet: 1, afterLastBullet: 4 });
	});

	it("stops at heading", () => {
		const lines = ["# Inhalt", "- only", "## Other"];
		const result = findInhaltBulletRange(lines, 0);
		expect(result).toEqual({ firstBullet: 1, afterLastBullet: 2 });
	});

	it("handles single bullet", () => {
		const lines = ["# Inhalt", "- one"];
		const result = findInhaltBulletRange(lines, 0);
		expect(result).toEqual({ firstBullet: 1, afterLastBullet: 2 });
	});

	it("stops at non-bullet non-blank content", () => {
		const lines = ["# Inhalt", "- bullet", "plain text", "- not included"];
		const result = findInhaltBulletRange(lines, 0);
		expect(result).toEqual({ firstBullet: 1, afterLastBullet: 2 });
	});
});

describe("addVorgangSection", () => {
	const date = new Date(2026, 1, 6);

	it("appends Inhalt + section when no # Inhalt exists", () => {
		const content = "# Titel\n\nSome content";
		const { newContent, cursorLineIndex } = addVorgangSection(content, "Review", date);

		expect(newContent).toContain("# Inhalt");
		expect(newContent).toContain("- [[#Review, 06.02.2026]]");
		expect(newContent).toContain("##### Review, 06.02.2026");

		const lines = newContent.split("\n");
		expect(lines[cursorLineIndex]).toBe("");
	});

	it("handles empty content with no # Inhalt", () => {
		const { newContent, cursorLineIndex } = addVorgangSection("", "First", date);

		expect(newContent).toContain("# Inhalt");
		expect(newContent).toContain("- [[#First, 06.02.2026]]");
		expect(newContent).toContain("##### First, 06.02.2026");

		const lines = newContent.split("\n");
		expect(lines[cursorLineIndex]).toBe("");
	});

	it("inserts bullet and h5 when # Inhalt has no bullets", () => {
		const content = [
			"# Titel",
			"",
			"# Inhalt",
			"",
			"##### Existing, 01.02.2026",
			"- some note",
		].join("\n");
		const { newContent, cursorLineIndex } = addVorgangSection(
			content,
			"New Section",
			date,
		);

		const lines = newContent.split("\n");
		// Bullet inserted after # Inhalt
		expect(lines[3]).toBe("- [[#New Section, 06.02.2026]]");
		// H5 inserted before existing #####
		const headerIdx = lines.indexOf("##### New Section, 06.02.2026");
		expect(headerIdx).toBeGreaterThan(-1);
		expect(lines[cursorLineIndex]).toBe("");
		// Existing h5 still present
		expect(newContent).toContain("##### Existing, 01.02.2026");
	});

	it("inserts bullet and h5 in normal case with existing bullets", () => {
		const content = [
			"# Titel",
			"",
			"# Inhalt",
			"- Old Entry, 01.02.2026",
			"",
			"##### Old Entry, 01.02.2026",
			"- old note",
		].join("\n");
		const { newContent, cursorLineIndex } = addVorgangSection(
			content,
			"New Entry",
			date,
		);

		const lines = newContent.split("\n");
		// New bullet inserted as first item
		expect(lines[3]).toBe("- [[#New Entry, 06.02.2026]]");
		// Old bullet still present
		expect(lines[4]).toBe("- Old Entry, 01.02.2026");
		// New h5 inserted before old h5
		const newHeaderIdx = lines.indexOf("##### New Entry, 06.02.2026");
		const oldHeaderIdx = lines.indexOf("##### Old Entry, 01.02.2026");
		expect(newHeaderIdx).toBeLessThan(oldHeaderIdx);
		expect(lines[cursorLineIndex]).toBe("");
	});

	it("appends h5 at end when no existing h5 sections and Inhalt has no bullets", () => {
		const content = ["# Titel", "", "# Inhalt"].join("\n");
		const { newContent, cursorLineIndex } = addVorgangSection(content, "Solo", date);

		const lines = newContent.split("\n");
		expect(newContent).toContain("- [[#Solo, 06.02.2026]]");
		expect(newContent).toContain("##### Solo, 06.02.2026");
		expect(lines[cursorLineIndex]).toBe("");
	});

	it("appends h5 at end when no existing h5 sections and Inhalt has bullets", () => {
		const content = [
			"# Titel",
			"",
			"# Inhalt",
			"- Existing, 01.02.2026",
		].join("\n");
		const { newContent, cursorLineIndex } = addVorgangSection(
			content,
			"Another",
			date,
		);

		const lines = newContent.split("\n");
		expect(newContent).toContain("- [[#Another, 06.02.2026]]");
		expect(newContent).toContain("##### Another, 06.02.2026");
		expect(lines[cursorLineIndex]).toBe("");
	});

	it("works with realistic Vorgang note content", () => {
		const content = [
			"---",
			"Created at: 2024-03-28",
			"---",
			"",
			"# Inhalt",
			"- Abstimmung mit Daniel, 01.02.2026",
			"- Kick-Off, 15.01.2026",
			"",
			"##### Abstimmung mit Daniel, 01.02.2026",
			"- Discussed budget",
			"- Agreed on timeline",
			"",
			"##### Kick-Off, 15.01.2026",
			"- Initial meeting",
		].join("\n");
		const { newContent, cursorLineIndex } = addVorgangSection(
			content,
			"Status Update",
			date,
		);

		const lines = newContent.split("\n");
		// New bullet inserted as first in Inhalt
		expect(lines[5]).toBe("- [[#Status Update, 06.02.2026]]");
		// Old bullets still present after
		expect(lines[6]).toBe("- Abstimmung mit Daniel, 01.02.2026");
		expect(lines[7]).toBe("- Kick-Off, 15.01.2026");
		// New h5 before existing h5s
		const newHeaderIdx = lines.indexOf("##### Status Update, 06.02.2026");
		const firstOldHeaderIdx = lines.indexOf(
			"##### Abstimmung mit Daniel, 01.02.2026",
		);
		expect(newHeaderIdx).toBeLessThan(firstOldHeaderIdx);
		// Cursor on stub line
		expect(lines[cursorLineIndex]).toBe("");
		// All original content preserved
		expect(newContent).toContain("##### Kick-Off, 15.01.2026");
		expect(newContent).toContain("- Initial meeting");
	});

	it("cursor line is always a '- ' stub for immediate typing", () => {
		const content = [
			"# Inhalt",
			"- Existing, 01.02.2026",
			"",
			"##### Existing, 01.02.2026",
			"- note",
		].join("\n");
		const { newContent, cursorLineIndex } = addVorgangSection(
			content,
			"Test",
			date,
		);
		const lines = newContent.split("\n");
		expect(lines[cursorLineIndex]).toBe("");
	});
});
