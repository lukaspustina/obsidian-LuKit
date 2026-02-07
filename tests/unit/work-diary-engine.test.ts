import { describe, it, expect } from "vitest";
import {
	formatTodayHeader,
	findThirdSeparatorIndex,
	findTodayHeaderIndex,
	ensureTodayHeader,
	addEntryUnderToday,
	formatDiaryEntry,
	formatTextEntry,
	validateDiaryStructure,
	formatReminderEntry,
	addReminder,
} from "../../src/features/work-diary/work-diary-engine";

describe("formatTodayHeader", () => {
	it("formats a Friday correctly", () => {
		const friday = new Date(2026, 1, 6); // Feb 6, 2026 is a Friday
		expect(formatTodayHeader(friday)).toBe("##### Fr, 06.02.2026");
	});

	it("formats a Monday correctly", () => {
		const monday = new Date(2026, 1, 2);
		expect(formatTodayHeader(monday)).toBe("##### Mo, 02.02.2026");
	});

	it("formats a Sunday correctly", () => {
		const sunday = new Date(2026, 1, 1);
		expect(formatTodayHeader(sunday)).toBe("##### So, 01.02.2026");
	});

	it("zero-pads single-digit day and month", () => {
		const date = new Date(2026, 0, 5); // Jan 5
		expect(formatTodayHeader(date)).toBe("##### Mo, 05.01.2026");
	});

	it("handles double-digit day and month", () => {
		const date = new Date(2026, 11, 25); // Dec 25
		expect(formatTodayHeader(date)).toBe("##### Fr, 25.12.2026");
	});

	it("uses German weekday abbreviations", () => {
		// Week starting Sunday Jan 4, 2026
		const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
		for (let i = 0; i < 7; i++) {
			const date = new Date(2026, 0, 4 + i); // Jan 4 is Sunday
			const header = formatTodayHeader(date);
			expect(header).toContain(days[i]);
		}
	});
});

describe("findThirdSeparatorIndex", () => {
	it("finds the third separator (after frontmatter + pinned links)", () => {
		const lines = ["---", "key: value", "---", "[[pinned]]", "---", "diary"];
		expect(findThirdSeparatorIndex(lines)).toBe(4);
	});

	it("returns -1 when no separators exist", () => {
		const lines = ["content", "more content"];
		expect(findThirdSeparatorIndex(lines)).toBe(-1);
	});

	it("returns -1 when only two separators exist (frontmatter only)", () => {
		const lines = ["---", "key: value", "---", "content"];
		expect(findThirdSeparatorIndex(lines)).toBe(-1);
	});

	it("handles separators with surrounding whitespace", () => {
		const lines = ["---", "key: value", "---", "pinned", "  ---  ", "diary"];
		expect(findThirdSeparatorIndex(lines)).toBe(4);
	});

	it("finds third separator among four or more", () => {
		const lines = ["---", "front", "---", "pinned", "---", "diary", "---", "extra"];
		expect(findThirdSeparatorIndex(lines)).toBe(4);
	});

	it("handles empty lines between separators", () => {
		const lines = ["---", "", "key: value", "", "---", "", "[[pinned]]", "", "---"];
		expect(findThirdSeparatorIndex(lines)).toBe(8);
	});
});

describe("findTodayHeaderIndex", () => {
	const friday = new Date(2026, 1, 6);

	it("finds today's header after the third separator", () => {
		const lines = ["---", "fm", "---", "[[pinned]]", "---", "##### Fr, 06.02.2026", "- entry"];
		expect(findTodayHeaderIndex(lines, 4, friday)).toBe(5);
	});

	it("returns -1 when header is missing", () => {
		const lines = ["---", "fm", "---", "[[pinned]]", "---", "##### Do, 05.02.2026", "- entry"];
		expect(findTodayHeaderIndex(lines, 4, friday)).toBe(-1);
	});

	it("ignores headers before the afterLine", () => {
		const lines = ["##### Fr, 06.02.2026", "---", "fm", "---", "[[pinned]]", "---"];
		expect(findTodayHeaderIndex(lines, 5, friday)).toBe(-1);
	});

	it("finds header with blank lines between separator and header", () => {
		const lines = ["---", "fm", "---", "[[pinned]]", "---", "", "##### Fr, 06.02.2026"];
		expect(findTodayHeaderIndex(lines, 4, friday)).toBe(6);
	});
});

describe("ensureTodayHeader", () => {
	const friday = new Date(2026, 1, 6);

	it("inserts header after third separator when missing", () => {
		const content = "---\nkey: value\n---\n[[pinned]]\n\n---\n##### Do, 05.02.2026\n- old entry";
		const result = ensureTodayHeader(content, friday);
		const lines = result.newContent.split("\n");
		expect(lines[result.headerLineIndex]).toBe("##### Fr, 06.02.2026");
		// Third separator is at index 5, header inserted at index 6
		expect(result.headerLineIndex).toBe(6);
	});

	it("is idempotent when header already exists", () => {
		const content = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026\n- entry";
		const result = ensureTodayHeader(content, friday);
		expect(result.newContent).toBe(content);
		expect(result.headerLineIndex).toBe(5);
	});

	it("appends separator + header when no third separator found", () => {
		const content = "---\nfm\n---\nsome content without third separator";
		const result = ensureTodayHeader(content, friday);
		expect(result.newContent).toContain("---\n##### Fr, 06.02.2026");
	});

	it("handles content with frontmatter and pinned links", () => {
		const content = "---\ntitle: Work\n---\n[[link1]]\n[[link2]]\n\n---\n##### Do, 05.02.2026\n- old";
		const result = ensureTodayHeader(content, friday);
		const lines = result.newContent.split("\n");
		// Third separator is at index 6, header inserted at index 7
		expect(lines[result.headerLineIndex]).toBe("##### Fr, 06.02.2026");
		// Old entries should still be there
		expect(result.newContent).toContain("##### Do, 05.02.2026");
	});

	it("handles empty content", () => {
		const result = ensureTodayHeader("", friday);
		expect(result.newContent).toContain("##### Fr, 06.02.2026");
		expect(result.newContent).toContain("---");
	});

	it("appends separator + header when only frontmatter exists", () => {
		const content = "---\nfm\n---";
		const result = ensureTodayHeader(content, friday);
		expect(result.newContent).toContain("---\n##### Fr, 06.02.2026");
	});

	it("returns fallback: true when no third separator found", () => {
		const content = "---\nfm\n---\nsome content without third separator";
		const result = ensureTodayHeader(content, friday);
		expect(result.fallback).toBe(true);
	});

	it("returns fallback: false when third separator exists", () => {
		const content = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026";
		const result = ensureTodayHeader(content, friday);
		expect(result.fallback).toBe(false);
	});

	it("returns fallback: false when inserting new header after existing separator", () => {
		const content = "---\nfm\n---\n[[pinned]]\n---\n##### Do, 05.02.2026\n- old";
		const result = ensureTodayHeader(content, friday);
		expect(result.fallback).toBe(false);
	});

	it("works with real note content (frontmatter + pinned links + diary separator)", () => {
		const content = [
			"---",
			"Created at: 2024-03-28 09:53:09",
			"Last updated at: 2026-02-06T16:24:31+01:00",
			"Author: Lukas Pustina",
			"---",
			"",
			'**[[Scopevisio/SVG/Initiativen.md|Initiativen: Große Initiativen 2025]]**',
			"",
			"---",
			"**Fr, 06.02.2026 -- Bonn**",
			"- [[Vorgang - Fibunet]]: Abstimmung mit Daniel Kosz, 06.02.2026",
		].join("\n");
		const result = ensureTodayHeader(content, friday);
		const lines = result.newContent.split("\n");
		// Third separator is at index 8, header inserted at index 9
		expect(result.headerLineIndex).toBe(9);
		expect(lines[9]).toBe("##### Fr, 06.02.2026");
		// Original content preserved after the header
		expect(lines[10]).toBe("**Fr, 06.02.2026 -- Bonn**");
	});
});

describe("addEntryUnderToday", () => {
	const friday = new Date(2026, 1, 6);

	it("adds first entry under today's header", () => {
		const content = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026";
		const result = addEntryUnderToday(content, "- [[Note]]", friday);
		const lines = result.newContent.split("\n");
		expect(lines[result.entryLineIndex]).toBe("- [[Note]]");
		expect(result.entryLineIndex).toBe(6);
	});

	it("appends after existing entries", () => {
		const content = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026\n- [[First]]";
		const result = addEntryUnderToday(content, "- [[Second]]", friday);
		const lines = result.newContent.split("\n");
		expect(lines[result.entryLineIndex]).toBe("- [[Second]]");
		expect(result.entryLineIndex).toBe(7);
	});

	it("creates header if missing then adds entry", () => {
		const content = "---\nfm\n---\n[[pinned]]\n---\n##### Do, 05.02.2026\n- old";
		const result = addEntryUnderToday(content, "- [[New]]", friday);
		expect(result.newContent).toContain("##### Fr, 06.02.2026");
		const lines = result.newContent.split("\n");
		expect(lines[result.entryLineIndex]).toBe("- [[New]]");
	});

	it("does not mix entries between days", () => {
		const content = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026\n- [[Today]]\n\n##### Do, 05.02.2026\n- [[Yesterday]]";
		const result = addEntryUnderToday(content, "- [[New]]", friday);
		const lines = result.newContent.split("\n");
		// New entry should be after [[Today]] but before the blank line
		expect(lines[result.entryLineIndex]).toBe("- [[New]]");
		expect(result.entryLineIndex).toBe(7);
	});
});

describe("formatDiaryEntry", () => {
	it("formats with note and heading", () => {
		expect(formatDiaryEntry("My Note", "Section")).toBe(
			"- [[My Note#Section|My Note: Section]]"
		);
	});

	it("formats with note only, no heading", () => {
		expect(formatDiaryEntry("My Note", null)).toBe("- [[My Note]]");
	});
});

describe("formatTextEntry", () => {
	it("formats plain text as a bullet", () => {
		expect(formatTextEntry("reviewed the budget")).toBe("- reviewed the budget");
	});

	it("preserves text as-is", () => {
		expect(formatTextEntry("some [[link]] in text")).toBe(
			"- some [[link]] in text"
		);
	});
});

describe("formatReminderEntry", () => {
	it("formats text with date", () => {
		const friday = new Date(2026, 1, 6);
		expect(formatReminderEntry("Call dentist", friday)).toBe("- Call dentist, 06.02.2026");
	});

	it("zero-pads single-digit day and month", () => {
		const date = new Date(2026, 0, 5);
		expect(formatReminderEntry("Buy groceries", date)).toBe("- Buy groceries, 05.01.2026");
	});

	it("handles double-digit day and month", () => {
		const date = new Date(2026, 11, 25);
		expect(formatReminderEntry("Christmas shopping", date)).toBe("- Christmas shopping, 25.12.2026");
	});
});

describe("addReminder", () => {
	it("creates Erinnerungen section and inserts entry when section does not exist", () => {
		const content = "---\nfm\n---\n[[pinned]]\n\n---\n##### Fr, 06.02.2026\n- entry";
		const entry = "- Call dentist, 06.02.2026";
		const result = addReminder(content, entry);
		expect(result).not.toBeNull();
		const lines = result!.newContent.split("\n");
		const headingIdx = lines.indexOf("# Erinnerungen");
		expect(headingIdx).toBeGreaterThan(-1);
		expect(lines[headingIdx + 1]).toBe(entry);
		// Section is before the third separator
		const thirdSepIdx = lines.indexOf("---", headingIdx);
		expect(thirdSepIdx).toBeGreaterThan(headingIdx + 1);
	});

	it("inserts entry after existing Erinnerungen heading (newest first)", () => {
		const content = "---\nfm\n---\n[[pinned]]\n\n# Erinnerungen\n- Old reminder, 05.02.2026\n\n---\n##### Fr, 06.02.2026";
		const entry = "- New reminder, 06.02.2026";
		const result = addReminder(content, entry);
		expect(result).not.toBeNull();
		const lines = result!.newContent.split("\n");
		const headingIdx = lines.indexOf("# Erinnerungen");
		expect(lines[headingIdx + 1]).toBe("- New reminder, 06.02.2026");
		expect(lines[headingIdx + 2]).toBe("- Old reminder, 05.02.2026");
	});

	it("returns null when third separator is missing", () => {
		const content = "---\nfm\n---\nsome content";
		const result = addReminder(content, "- reminder, 06.02.2026");
		expect(result).toBeNull();
	});

	it("preserves all content after the third separator", () => {
		const content = "---\nfm\n---\n[[pinned]]\n\n---\n##### Fr, 06.02.2026\n- entry1\n- entry2";
		const entry = "- Call dentist, 06.02.2026";
		const result = addReminder(content, entry);
		expect(result).not.toBeNull();
		expect(result!.newContent).toContain("##### Fr, 06.02.2026");
		expect(result!.newContent).toContain("- entry1");
		expect(result!.newContent).toContain("- entry2");
	});

	it("handles no blank line before third separator", () => {
		const content = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026";
		const entry = "- reminder, 06.02.2026";
		const result = addReminder(content, entry);
		expect(result).not.toBeNull();
		const lines = result!.newContent.split("\n");
		const headingIdx = lines.indexOf("# Erinnerungen");
		expect(headingIdx).toBeGreaterThan(-1);
		// Should have a blank line before # Erinnerungen since [[pinned]] is non-empty
		expect(lines[headingIdx - 1].trim()).toBe("");
	});

	it("handles blank line already before third separator", () => {
		const content = "---\nfm\n---\n[[pinned]]\n\n---\n##### Fr, 06.02.2026";
		const entry = "- reminder, 06.02.2026";
		const result = addReminder(content, entry);
		expect(result).not.toBeNull();
		const lines = result!.newContent.split("\n");
		const headingIdx = lines.indexOf("# Erinnerungen");
		// No double blank lines before # Erinnerungen
		expect(lines[headingIdx - 1].trim()).toBe("");
		expect(lines[headingIdx - 2].trim()).not.toBe("");
	});

	it("is idempotent with section creation — second call adds to existing section", () => {
		const content = "---\nfm\n---\n[[pinned]]\n\n---\n##### Fr, 06.02.2026";
		const first = addReminder(content, "- first, 06.02.2026");
		const second = addReminder(first!.newContent, "- second, 07.02.2026");
		expect(second).not.toBeNull();
		const lines = second!.newContent.split("\n");
		const headingIdx = lines.indexOf("# Erinnerungen");
		expect(lines[headingIdx + 1]).toBe("- second, 07.02.2026");
		expect(lines[headingIdx + 2]).toBe("- first, 06.02.2026");
	});

	it("preserves pinned links between frontmatter and Erinnerungen", () => {
		const content = "---\nfm\n---\n[[link1]]\n[[link2]]\n\n---\n##### Fr, 06.02.2026";
		const result = addReminder(content, "- reminder, 06.02.2026");
		expect(result).not.toBeNull();
		expect(result!.newContent).toContain("[[link1]]");
		expect(result!.newContent).toContain("[[link2]]");
	});
});

describe("validateDiaryStructure", () => {
	it("returns no errors for valid diary structure", () => {
		const content = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026";
		expect(validateDiaryStructure(content)).toEqual([]);
	});

	it("returns error when third separator is missing", () => {
		const content = "---\nfm\n---\nsome content";
		const errors = validateDiaryStructure(content);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain("third separator");
	});

	it("returns error for empty content", () => {
		const errors = validateDiaryStructure("");
		expect(errors).toHaveLength(1);
	});

	it("returns no errors when only frontmatter and third separator exist", () => {
		const content = "---\nfm\n---\n[[pinned]]\n---";
		expect(validateDiaryStructure(content)).toEqual([]);
	});
});
