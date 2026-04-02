import { describe, it, expect } from "vitest";
import {
	formatVorgangHeadingText,
	formatVorgangHeader,
	formatVorgangBullet,
	findInhaltSectionIndex,
	findInhaltBulletRange,
	addVorgangSection,
	addVorgangSectionLinked,
} from "../../src/features/vorgang/vorgang-engine";
import { formatDate, extractDateFromTitle } from "../../src/shared/date-format";

describe("formatDate", () => {
	it("formats a date with zero-padded day and month", () => {
		const date = new Date(2026, 0, 5); // Jan 5
		expect(formatDate(date, "de")).toBe("05.01.2026");
	});

	it("formats double-digit day and month", () => {
		const date = new Date(2026, 11, 25); // Dec 25
		expect(formatDate(date, "de")).toBe("25.12.2026");
	});

	it("handles single-digit month", () => {
		const date = new Date(2026, 1, 6); // Feb 6
		expect(formatDate(date, "de")).toBe("06.02.2026");
	});

	it("formats English locale", () => {
		const date = new Date(2026, 1, 6);
		expect(formatDate(date, "en")).toBe("02/06/2026");
	});

	it("formats ISO locale", () => {
		const date = new Date(2026, 1, 6);
		expect(formatDate(date, "iso")).toBe("2026-02-06");
	});
});

describe("formatVorgangHeadingText", () => {
	it("returns name and date without ##### prefix", () => {
		const date = new Date(2026, 1, 6);
		expect(formatVorgangHeadingText("Abstimmung", "de", date)).toBe(
			"Abstimmung, 06.02.2026",
		);
	});

	it("formats with English locale", () => {
		const date = new Date(2026, 1, 6);
		expect(formatVorgangHeadingText("Abstimmung", "en", date)).toBe(
			"Abstimmung, 02/06/2026",
		);
	});

	it("formats with ISO locale", () => {
		const date = new Date(2026, 1, 6);
		expect(formatVorgangHeadingText("Abstimmung", "iso", date)).toBe(
			"Abstimmung, 2026-02-06",
		);
	});
});

describe("formatVorgangHeader", () => {
	it("formats header with name and date", () => {
		const date = new Date(2026, 1, 6);
		expect(formatVorgangHeader("Abstimmung", "de", date)).toBe(
			"##### Abstimmung, 06.02.2026",
		);
	});

	it("handles names with special characters", () => {
		const date = new Date(2026, 1, 6);
		expect(formatVorgangHeader("Besprechung: Fibunet", "de", date)).toBe(
			"##### Besprechung: Fibunet, 06.02.2026",
		);
	});
});

describe("formatVorgangBullet", () => {
	it("formats bullet with name and date", () => {
		const date = new Date(2026, 1, 6);
		expect(formatVorgangBullet("Abstimmung", "de", date)).toBe(
			"- [[#Abstimmung, 06.02.2026]]",
		);
	});

	it("formats bullet with English locale", () => {
		const date = new Date(2026, 1, 6);
		expect(formatVorgangBullet("Abstimmung", "en", date)).toBe(
			"- [[#Abstimmung, 02/06/2026]]",
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
		const { newContent, cursorLineIndex } = addVorgangSection(content, "Review", "de", date);

		expect(newContent).toContain("# Inhalt");
		expect(newContent).toContain("- [[#Review, 06.02.2026]]");
		expect(newContent).toContain("##### Review, 06.02.2026");

		const lines = newContent.split("\n");
		expect(lines[cursorLineIndex]).toBe("");
	});

	it("handles empty content with no # Inhalt", () => {
		const { newContent, cursorLineIndex } = addVorgangSection("", "First", "de", date);

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
			"de",
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
			"de",
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
		const { newContent, cursorLineIndex } = addVorgangSection(content, "Solo", "de", date);

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
			"de",
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
			"de",
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
			"de",
			date,
		);
		const lines = newContent.split("\n");
		expect(lines[cursorLineIndex]).toBe("");
	});

	it("works with English locale", () => {
		const content = "# Titel\n\n# Inhalt\n- Existing, 01.02.2026\n\n##### Existing, 01.02.2026\n- note";
		const { newContent } = addVorgangSection(content, "Review", "en", date);
		expect(newContent).toContain("- [[#Review, 02/06/2026]]");
		expect(newContent).toContain("##### Review, 02/06/2026");
	});

	it("works with ISO locale", () => {
		const content = "# Titel\n\n# Inhalt\n- Existing, 01.02.2026\n\n##### Existing, 01.02.2026\n- note";
		const { newContent } = addVorgangSection(content, "Review", "iso", date);
		expect(newContent).toContain("- [[#Review, 2026-02-06]]");
		expect(newContent).toContain("##### Review, 2026-02-06");
	});

	it("inserts past-dated TOC bullet between newer and older entries", () => {
		const pastDate = new Date(2026, 0, 25); // 25.01.2026 — between the two existing entries
		const content = [
			"# Inhalt",
			"- [[#Recent, 06.02.2026]]",
			"- [[#Old, 15.01.2026]]",
			"",
			"##### Recent, 06.02.2026",
			"- note",
			"",
			"##### Old, 15.01.2026",
			"- note",
		].join("\n");

		const { newContent } = addVorgangSection(content, "Middle", "de", pastDate);
		const lines = newContent.split("\n");

		const recentIdx = lines.indexOf("- [[#Recent, 06.02.2026]]");
		const middleIdx = lines.indexOf("- [[#Middle, 25.01.2026]]");
		const oldIdx = lines.indexOf("- [[#Old, 15.01.2026]]");

		expect(middleIdx).toBeGreaterThan(recentIdx);
		expect(middleIdx).toBeLessThan(oldIdx);
	});

	it("inserts past-dated h5 section between newer and older sections", () => {
		const pastDate = new Date(2026, 0, 25); // 25.01.2026
		const content = [
			"# Inhalt",
			"- [[#Recent, 06.02.2026]]",
			"- [[#Old, 15.01.2026]]",
			"",
			"##### Recent, 06.02.2026",
			"- note",
			"",
			"##### Old, 15.01.2026",
			"- note",
		].join("\n");

		const { newContent } = addVorgangSection(content, "Middle", "de", pastDate);
		const lines = newContent.split("\n");

		const recentH5 = lines.indexOf("##### Recent, 06.02.2026");
		const middleH5 = lines.indexOf("##### Middle, 25.01.2026");
		const oldH5 = lines.indexOf("##### Old, 15.01.2026");

		expect(middleH5).toBeGreaterThan(recentH5);
		expect(middleH5).toBeLessThan(oldH5);
	});

	it("inserts same-date bullet before existing same-date bullet", () => {
		const content = [
			"# Inhalt",
			"- [[#Old Section, 06.02.2026]]",
			"",
			"##### Old Section, 06.02.2026",
			"- note",
		].join("\n");

		const { newContent } = addVorgangSection(content, "New Section", "de", date);
		const lines = newContent.split("\n");
		const newBulletIdx = lines.indexOf("- [[#New Section, 06.02.2026]]");
		const oldBulletIdx = lines.indexOf("- [[#Old Section, 06.02.2026]]");
		expect(newBulletIdx).toBeLessThan(oldBulletIdx);
	});

	it("appends TOC bullet and h5 at end when date is older than all existing entries", () => {
		const oldDate = new Date(2026, 0, 1); // 01.01.2026 — older than everything
		const content = [
			"# Inhalt",
			"- [[#Recent, 06.02.2026]]",
			"- [[#Middle, 25.01.2026]]",
			"",
			"##### Recent, 06.02.2026",
			"- note",
			"",
			"##### Middle, 25.01.2026",
			"- note",
		].join("\n");

		const { newContent } = addVorgangSection(content, "Archive", "de", oldDate);
		const lines = newContent.split("\n");

		const middleBulletIdx = lines.indexOf("- [[#Middle, 25.01.2026]]");
		const archiveBulletIdx = lines.indexOf("- [[#Archive, 01.01.2026]]");
		const middleH5 = lines.indexOf("##### Middle, 25.01.2026");
		const archiveH5 = lines.indexOf("##### Archive, 01.01.2026");

		expect(archiveBulletIdx).toBeGreaterThan(middleBulletIdx);
		expect(archiveH5).toBeGreaterThan(middleH5);
	});
});

describe("addVorgangSectionLinked", () => {
	const date = new Date(2026, 1, 6); // 06.02.2026

	it("produces linked h5 header format", () => {
		const content = "# Fakten\n\n# Inhalt\n- [[#Old, 05.01.2026]]\n\n##### Old, 05.01.2026\n- note";
		const { newContent } = addVorgangSectionLinked(content, "Besprechung Alpha", "de", date);
		expect(newContent).toContain("##### [[Besprechung Alpha]], 06.02.2026");
	});

	it("produces plain anchor bullet (no wikilink brackets)", () => {
		const content = "# Inhalt\n- [[#Old, 05.01.2026]]\n\n##### Old, 05.01.2026\n- note";
		const { newContent } = addVorgangSectionLinked(content, "Besprechung Alpha", "de", date);
		expect(newContent).toContain("- [[#Besprechung Alpha, 06.02.2026]]");
		expect(newContent).not.toContain("- [[#[[");
	});

	it("inserts body lines directly after the h5 header (no blank line)", () => {
		const content = "# Inhalt\n";
		const body = ["**Nächste Schritte**", "- Step 1", "- Step 2"];
		const { newContent } = addVorgangSectionLinked(content, "Meeting Note", "de", date, body);
		const lines = newContent.split("\n");
		const h5Idx = lines.indexOf("##### [[Meeting Note]], 06.02.2026");
		expect(h5Idx).toBeGreaterThan(-1);
		expect(lines[h5Idx + 1]).toBe("**Nächste Schritte**");
		expect(lines[h5Idx + 2]).toBe("- Step 1");
		expect(lines[h5Idx + 3]).toBe("- Step 2");
	});

	it("inserts in date order relative to existing sections", () => {
		const content = [
			"# Inhalt",
			"- [[#Recent, 10.02.2026]]",
			"- [[#Old, 01.01.2026]]",
			"",
			"##### Recent, 10.02.2026",
			"- note",
			"",
			"##### Old, 01.01.2026",
			"- note",
		].join("\n");
		// date = 06.02.2026 → between Recent and Old
		const { newContent } = addVorgangSectionLinked(content, "Mid Meeting", "de", date);
		const lines = newContent.split("\n");
		const recentBullet = lines.indexOf("- [[#Recent, 10.02.2026]]");
		const midBullet = lines.indexOf("- [[#Mid Meeting, 06.02.2026]]");
		const oldBullet = lines.indexOf("- [[#Old, 01.01.2026]]");
		expect(recentBullet).toBeLessThan(midBullet);
		expect(midBullet).toBeLessThan(oldBullet);

		const recentH5 = lines.indexOf("##### Recent, 10.02.2026");
		const midH5 = lines.indexOf("##### [[Mid Meeting]], 06.02.2026");
		const oldH5 = lines.indexOf("##### Old, 01.01.2026");
		expect(recentH5).toBeLessThan(midH5);
		expect(midH5).toBeLessThan(oldH5);
	});

	it("creates # Inhalt when none exists", () => {
		const content = "# Fakten und Pointer\n\nSome content";
		const { newContent } = addVorgangSectionLinked(content, "New Meeting", "de", date);
		expect(newContent).toContain("# Inhalt");
		expect(newContent).toContain("- [[#New Meeting, 06.02.2026]]");
		expect(newContent).toContain("##### [[New Meeting]], 06.02.2026");
	});

	it("without body behaves like addVorgangSection structurally", () => {
		const content = "# Inhalt\n";
		const { newContent: linked } = addVorgangSectionLinked(content, "A", "de", date);
		const { newContent: plain } = addVorgangSection(content, "A", "de", date);
		// Both should have a TOC bullet and an h5
		expect(linked).toContain("- [[#A, 06.02.2026]]");
		expect(plain).toContain("- [[#A, 06.02.2026]]");
		// Header differs: linked wraps in [[]]
		expect(linked).toContain("##### [[A]], 06.02.2026");
		expect(plain).toContain("##### A, 06.02.2026");
	});

	it("does not append date when note name already ends with one", () => {
		const base = "# Inhalt\n";
		const d = new Date(2026, 2, 2); // 02.03.2026
		const noteName = "Besprechung - Intro Müller, 02.03.2026";
		const { newContent } = addVorgangSectionLinked(base, noteName, "de", d);
		// Date must not appear twice
		expect(newContent).not.toContain("02.03.2026, 02.03.2026");
		// Header: just the wikilink, no extra date
		expect(newContent).toContain(`##### [[${noteName}]]`);
		expect(newContent).not.toContain(`##### [[${noteName}]], 02.03.2026`);
		// Bullet: plain anchor without extra date
		expect(newContent).toContain(`- [[#${noteName}]]`);
	});
});

describe("extractDateFromTitle", () => {
	it("extracts a German date from a Vorgang basename", () => {
		const d = extractDateFromTitle("Vorgang Kundengespräch, 03.03.2026", "de");
		expect(d).not.toBeNull();
		expect(d!.getFullYear()).toBe(2026);
		expect(d!.getMonth()).toBe(2); // March
		expect(d!.getDate()).toBe(3);
	});

	it("extracts an English date", () => {
		const d = extractDateFromTitle("Vorgang Client Call, 03/03/2026", "en");
		expect(d).not.toBeNull();
		expect(d!.getFullYear()).toBe(2026);
		expect(d!.getMonth()).toBe(2);
		expect(d!.getDate()).toBe(3);
	});

	it("extracts an ISO date", () => {
		const d = extractDateFromTitle("Vorgang Planning, 2026-03-03", "iso");
		expect(d).not.toBeNull();
		expect(d!.getFullYear()).toBe(2026);
	});

	it("returns null when no date in title", () => {
		expect(extractDateFromTitle("Vorgang Projekt Alpha", "de")).toBeNull();
	});

	it("returns null when trailing part is not a valid date", () => {
		expect(extractDateFromTitle("Vorgang Something, not-a-date", "de")).toBeNull();
	});
});
