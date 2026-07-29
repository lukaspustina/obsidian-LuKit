import { describe, it, expect } from "vitest";
import {
	formatVorgangHeadingText,
	formatVorgangHeader,
	formatVorgangBullet,
	formatLinkedBullet,
	findInhaltSectionIndex,
	findInhaltBulletRange,
	addVorgangSection,
	addVorgangSectionLinked,
	ensureVorgangSkeleton,
	appendDecisionsToFakten,
} from "../../src/features/vorgang/vorgang-engine";
import { extractDecisionLines } from "../../src/features/besprechung/besprechung-engine";
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
		expect(formatVorgangHeader("Besprechung: Acme", "de", date)).toBe(
			"##### Besprechung: Acme, 06.02.2026",
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
			"- Abstimmung mit Erika, 01.02.2026",
			"- Kick-Off, 15.01.2026",
			"",
			"##### Abstimmung mit Erika, 01.02.2026",
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
		expect(lines[6]).toBe("- Abstimmung mit Erika, 01.02.2026");
		expect(lines[7]).toBe("- Kick-Off, 15.01.2026");
		// New h5 before existing h5s
		const newHeaderIdx = lines.indexOf("##### Status Update, 06.02.2026");
		const firstOldHeaderIdx = lines.indexOf(
			"##### Abstimmung mit Erika, 01.02.2026",
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

describe("formatLinkedBullet", () => {
	it("uses bare anchor when note name already ends with a date", () => {
		const noteName = "Besprechung - Foo, 19.03.2026";
		const date = new Date(2026, 3, 27); // unrelated fallback
		expect(formatLinkedBullet(noteName, "de", date)).toBe(`- [[#${noteName}]]`);
	});

	it("appends date when note name has no date", () => {
		const date = new Date(2026, 1, 6);
		expect(formatLinkedBullet("Plain Note", "de", date)).toBe("- [[#Plain Note, 06.02.2026]]");
	});

	it("matches what addVorgangSectionLinked actually inserts (dup check use case)", () => {
		const noteName = "Besprechung - X, 19.03.2026";
		const fallbackDate = new Date(2026, 3, 27);
		const { newContent } = addVorgangSectionLinked("# Inhalt\n", noteName, "de", fallbackDate);
		const expected = formatLinkedBullet(noteName, "de", fallbackDate);
		expect(newContent).toContain(expected);
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

	it("places new h5 correctly relative to existing linked-form h5 headers", () => {
		// Existing h5 is in linked form `##### [[Name, DATE]]` (date inside brackets).
		// Without stripping trailing ]], extractDateFromTitle fails on the existing h5,
		// causing the new entry to be misplaced above it.
		const content = [
			"# Inhalt",
			"- [[#Existing, 19.03.2026]]",
			"",
			"##### [[Existing, 19.03.2026]]",
			"- note",
		].join("\n");
		const olderDate = new Date(2026, 2, 12); // 12.03.2026 — older than existing
		const { newContent } = addVorgangSectionLinked(content, "New Older", "de", olderDate);
		const lines = newContent.split("\n");
		const existingH5 = lines.indexOf("##### [[Existing, 19.03.2026]]");
		const newH5 = lines.indexOf("##### [[New Older]], 12.03.2026");
		expect(existingH5).toBeGreaterThan(-1);
		expect(newH5).toBeGreaterThan(-1);
		expect(existingH5).toBeLessThan(newH5);
	});

	it("sorts by note-name date when fallback date diverges from name", () => {
		// Existing TOC: 23.04.2026 (top), 11.03.2026 (bottom).
		// New besprechung name carries 19.03.2026; fallback date is today (27.04.2026).
		// Without the fix, sort would use 27.04.2026 and place the new entry above 23.04.2026.
		const content = [
			"# Inhalt",
			"- [[#Recent, 23.04.2026]]",
			"- [[#Older, 11.03.2026]]",
			"",
			"##### Recent, 23.04.2026",
			"- note",
			"",
			"##### Older, 11.03.2026",
			"- note",
		].join("\n");
		const fallbackDate = new Date(2026, 3, 27); // 27.04.2026 — later than all existing entries
		const noteName = "Besprechung - Progress Update, 19.03.2026";
		const { newContent } = addVorgangSectionLinked(content, noteName, "de", fallbackDate);
		const lines = newContent.split("\n");

		const recentBullet = lines.indexOf("- [[#Recent, 23.04.2026]]");
		const newBullet = lines.indexOf(`- [[#${noteName}]]`);
		const olderBullet = lines.indexOf("- [[#Older, 11.03.2026]]");
		expect(recentBullet).toBeGreaterThan(-1);
		expect(newBullet).toBeGreaterThan(-1);
		expect(olderBullet).toBeGreaterThan(-1);
		expect(recentBullet).toBeLessThan(newBullet);
		expect(newBullet).toBeLessThan(olderBullet);

		const recentH5 = lines.indexOf("##### Recent, 23.04.2026");
		const newH5 = lines.indexOf(`##### [[${noteName}]]`);
		const olderH5 = lines.indexOf("##### Older, 11.03.2026");
		expect(recentH5).toBeLessThan(newH5);
		expect(newH5).toBeLessThan(olderH5);
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

describe("addVorgangSection with bodyLines", () => {
	const content = [
		"# Fakten und Pointer",
		"",
		"# Inhalt",
		"- [[#Alpha, 01.01.2026]]",
		"",
		"##### Alpha, 01.01.2026",
		"- existing",
		"",
	].join("\n");

	it("inserts the body lines under the new h5 and adds one TOC bullet", () => {
		const date = new Date(2026, 5, 30); // 30.06.2026
		const { newContent } = addVorgangSection(content, "Müller", "de", date, ["line1", "line2"]);

		expect(newContent).toContain("##### Müller, 30.06.2026");
		expect(newContent).toContain("line1");
		expect(newContent).toContain("line2");
		// Body lines sit below the new heading.
		expect(newContent.indexOf("line1")).toBeGreaterThan(newContent.indexOf("##### Müller, 30.06.2026"));
		// TOC gains exactly one new wikilink bullet (1 existing → 2).
		expect((newContent.match(/- \[\[#/g) ?? []).length).toBe(2);
	});
});

describe("ensureVorgangSkeleton", () => {
	const date = new Date(2026, 6, 5); // 05.07.2026

	it("adds the skeleton after the frontmatter when the body is empty", () => {
		const content = "---\ntags: []\n---\n";
		const result = ensureVorgangSkeleton(content, "de", date);
		expect(result).toBe("---\ntags: []\n---\n\n# Fakten und Pointer\n\n# Nächste Schritte\n\n# Inhalt\n");
	});

	it("moves an existing body into a dated 'Notiz' section with TOC entry", () => {
		const content = ["---", "tags: []", "---", "", "Alte Zeile 1", "- alter Bullet", ""].join("\n");
		const result = ensureVorgangSkeleton(content, "de", date);

		expect(result).toContain("# Fakten und Pointer");
		expect(result).toContain("# Nächste Schritte");
		expect(result).toContain("- [[#Notiz, 05.07.2026]]");
		expect(result).toContain("##### Notiz, 05.07.2026");
		// Body lines verbatim, below the new h5 header, in original order.
		const headerAt = result.indexOf("##### Notiz, 05.07.2026");
		expect(result.indexOf("Alte Zeile 1")).toBeGreaterThan(headerAt);
		expect(result.indexOf("- alter Bullet")).toBeGreaterThan(result.indexOf("Alte Zeile 1"));
		// The old body no longer sits above the skeleton.
		expect(result.indexOf("# Fakten und Pointer")).toBeLessThan(result.indexOf("Alte Zeile 1"));
	});

	it("is idempotent — content with # Inhalt stays unchanged", () => {
		const content = ["---", "tags: []", "---", "", "# Fakten und Pointer", "- x", "", "# Inhalt", ""].join("\n");
		expect(ensureVorgangSkeleton(content, "de", date)).toBe(content);
	});

	it("stays unchanged when only # Fakten und Pointer exists (no duplicate structure)", () => {
		const content = ["---", "tags: []", "---", "", "# Fakten und Pointer", "- x", ""].join("\n");
		expect(ensureVorgangSkeleton(content, "de", date)).toBe(content);
	});

	it("handles notes without frontmatter", () => {
		const result = ensureVorgangSkeleton("Nur Text\n", "de", date);
		expect(result.startsWith("# Fakten und Pointer")).toBe(true);
		expect(result).toContain("##### Notiz, 05.07.2026");
		expect(result.indexOf("Nur Text")).toBeGreaterThan(result.indexOf("##### Notiz, 05.07.2026"));
	});

	it("produces the bare skeleton for a completely empty note", () => {
		expect(ensureVorgangSkeleton("", "de", date)).toBe("# Fakten und Pointer\n\n# Nächste Schritte\n\n# Inhalt\n");
	});
});

describe("appendDecisionsToFakten (SDD besprechung-entscheidungen, Phase 2)", () => {
	const date = new Date(2026, 6, 29); // 29.07.2026
	const lines = ["- Variante B", "- Budget bleibt bei Q3"];

	const vorgang = (fakten: string[]): string =>
		[
			"---",
			"tags:",
			"  - Vorgang",
			"---",
			"",
			"# Fakten und Pointer",
			...fakten,
			"",
			"# Nächste Schritte",
			"- offen",
			"",
			"# Inhalt",
			"- [[#Status, 29.07.2026]]",
			"",
			"##### Status, 29.07.2026",
			"- aa",
		].join("\n");

	it("appends a grouped block at the end of the Fakten section", () => {
		const result = appendDecisionsToFakten(vorgang(["- Fakt eins", "- Fakt zwei"]), "Besprechung Acme", lines, "de", date);
		const out = result.content.split("\n");
		const faktenAt = out.indexOf("# Fakten und Pointer");
		const parentAt = out.indexOf("- Entscheidungen 29.07.2026 ([[Besprechung Acme]])");
		const naechsteAt = out.indexOf("# Nächste Schritte");
		expect(parentAt).toBeGreaterThan(out.indexOf("- Fakt zwei"));
		expect(parentAt).toBeLessThan(naechsteAt);
		expect(faktenAt).toBeLessThan(parentAt);
		expect(out[parentAt + 1]).toBe("    - Variante B");
		expect(out[parentAt + 2]).toBe("    - Budget bleibt bei Q3");
		expect(result.insertedLines).toBe(3);
	});

	it("leaves manual facts and the following section untouched", () => {
		const result = appendDecisionsToFakten(vorgang(["- Fakt eins"]), "Besprechung Acme", lines, "de", date);
		expect(result.content).toContain("- Fakt eins");
		expect(result.content).toContain("# Nächste Schritte\n- offen");
		expect(result.content).toContain("##### Status, 29.07.2026\n- aa");
	});

	it("inserts a new block directly above an existing decisions block", () => {
		const existing = [
			"- Fakt eins",
			"- Entscheidungen 01.07.2026 ([[Besprechung Alt]])",
			"    - Alte Entscheidung",
		];
		const result = appendDecisionsToFakten(vorgang(existing), "Besprechung Neu", lines, "de", date);
		const out = result.content.split("\n");
		const neu = out.indexOf("- Entscheidungen 29.07.2026 ([[Besprechung Neu]])");
		const alt = out.indexOf("- Entscheidungen 01.07.2026 ([[Besprechung Alt]])");
		expect(neu).toBeGreaterThan(out.indexOf("- Fakt eins"));
		expect(neu).toBeLessThan(alt);
	});

	// Zwei konfigurierte Entscheidungs-Überschriften ergeben eine flache Liste und
	// daraus genau ein Eltern-Bullet — nicht eines pro Überschrift.
	it("emits exactly one parent bullet for decisions gathered from two headings", () => {
		const content = ["# Entscheidungen", "- Deutsch eins", "# Decisions", "- English one"].join("\n");
		const gathered = extractDecisionLines(content, ["Entscheidungen", "Decisions"]);
		const result = appendDecisionsToFakten(vorgang(["- Fakt"]), "Besprechung Acme", gathered, "de", date);

		expect(result.content.split("- Entscheidungen ").length - 1).toBe(1);
		expect(result.content).toContain("    - Deutsch eins");
		expect(result.content).toContain("    - English one");
		expect(result.insertedLines).toBe(3);
	});

	it("adds one extra indent level to already-indented decision lines", () => {
		const nested = ["- Variante B", "    - weil günstiger"];
		const result = appendDecisionsToFakten(vorgang(["- Fakt"]), "Besprechung Acme", nested, "de", date);
		expect(result.content).toContain("    - Variante B");
		expect(result.content).toContain("        - weil günstiger");
	});

	it("is idempotent for a besprechung already in the decisions log", () => {
		const content = vorgang([
			"- Fakt",
			"- Entscheidungen 01.07.2026 ([[Besprechung Acme]])",
			"    - Alte Entscheidung",
		]);
		const result = appendDecisionsToFakten(content, "Besprechung Acme", lines, "de", date);
		expect(result.content).toBe(content);
		expect(result.insertedLines).toBe(0);
	});

	it("still inserts when a manual bullet links the same besprechung without the prefix", () => {
		const content = vorgang(["- Siehe [[Besprechung Acme]] für Details"]);
		const result = appendDecisionsToFakten(content, "Besprechung Acme", lines, "de", date);
		expect(result.content).toContain("- Entscheidungen 29.07.2026 ([[Besprechung Acme]])");
		expect(result.insertedLines).toBe(3);
	});

	// Legacy-Notizen, die die Migration noch nicht angefasst hat, tragen den alten
	// Header „# Fakten" (migration-engine mappt ihn auf „# Fakten und Pointer").
	it("accepts the legacy # Fakten header", () => {
		const legacy = [
			"---",
			"tags:",
			"  - Vorgang",
			"---",
			"",
			"# Fakten",
			"- Bestandsfakt",
			"",
			"# Inhalt",
			"",
		].join("\n");
		const result = appendDecisionsToFakten(legacy, "Besprechung Acme", lines, "de", date);
		const out = result.content.split("\n");
		const parentAt = out.indexOf("- Entscheidungen 29.07.2026 ([[Besprechung Acme]])");

		expect(parentAt).toBeGreaterThan(out.indexOf("- Bestandsfakt"));
		expect(parentAt).toBeLessThan(out.indexOf("# Inhalt"));
		expect(result.insertedLines).toBe(3);
	});

	it("prefers # Fakten und Pointer when a note carries both headers", () => {
		const both = [
			"# Fakten und Pointer",
			"- kanonisch",
			"",
			"# Fakten",
			"- legacy",
			"",
			"# Inhalt",
			"",
		].join("\n");
		const result = appendDecisionsToFakten(both, "Besprechung Acme", lines, "de", date);
		const out = result.content.split("\n");
		const parentAt = out.indexOf("- Entscheidungen 29.07.2026 ([[Besprechung Acme]])");

		expect(parentAt).toBeGreaterThan(out.indexOf("- kanonisch"));
		expect(parentAt).toBeLessThan(out.indexOf("# Fakten"));
	});

	it("is a no-op when the Fakten section is missing", () => {
		const content = ["---", "tags: []", "---", "", "# Inhalt", "", "##### Status, 29.07.2026", "- aa"].join("\n");
		const result = appendDecisionsToFakten(content, "Besprechung Acme", lines, "de", date);
		expect(result.content).toBe(content);
		expect(result.insertedLines).toBe(0);
	});

	it("is a no-op for an empty decision line list", () => {
		const content = vorgang(["- Fakt"]);
		const result = appendDecisionsToFakten(content, "Besprechung Acme", [], "de", date);
		expect(result.content).toBe(content);
		expect(result.insertedLines).toBe(0);
	});

	it("uses the locale date format and keeps the fixed Entscheidungen label", () => {
		const result = appendDecisionsToFakten(vorgang(["- Fakt"]), "Meeting Acme", lines, "en", date);
		expect(result.content).toContain("- Entscheidungen 07/29/2026 ([[Meeting Acme]])");
	});

	it("handles an empty Fakten section", () => {
		const result = appendDecisionsToFakten(vorgang([]), "Besprechung Acme", lines, "de", date);
		const out = result.content.split("\n");
		const parentAt = out.indexOf("- Entscheidungen 29.07.2026 ([[Besprechung Acme]])");
		expect(parentAt).toBe(out.indexOf("# Fakten und Pointer") + 1);
		expect(parentAt).toBeLessThan(out.indexOf("# Nächste Schritte"));
	});
});
