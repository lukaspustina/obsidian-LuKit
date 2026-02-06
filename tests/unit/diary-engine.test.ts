import { describe, it, expect } from "vitest";
import {
	formatTodayHeader,
	findThirdSeparatorIndex,
	findTodayHeaderIndex,
	ensureTodayHeader,
	addEntryUnderToday,
	formatDiaryEntry,
	formatTextEntry,
} from "../../src/features/work-diary/diary-engine";

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
