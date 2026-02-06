import { describe, it, expect } from "vitest";
import {
	formatTodayHeader,
	findSecondSeparatorIndex,
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

describe("findSecondSeparatorIndex", () => {
	it("finds the second separator after frontmatter", () => {
		const lines = ["---", "key: value", "---", "content"];
		expect(findSecondSeparatorIndex(lines)).toBe(2);
	});

	it("returns -1 when no separators exist", () => {
		const lines = ["content", "more content"];
		expect(findSecondSeparatorIndex(lines)).toBe(-1);
	});

	it("returns -1 when only one separator exists", () => {
		const lines = ["---", "content"];
		expect(findSecondSeparatorIndex(lines)).toBe(-1);
	});

	it("handles separators with surrounding whitespace", () => {
		const lines = ["---", "key: value", "  ---  ", "content"];
		expect(findSecondSeparatorIndex(lines)).toBe(2);
	});

	it("finds second separator among multiple", () => {
		const lines = ["---", "front", "---", "pinned", "---", "diary"];
		expect(findSecondSeparatorIndex(lines)).toBe(2);
	});

	it("handles empty lines between separators", () => {
		const lines = ["---", "", "key: value", "", "---"];
		expect(findSecondSeparatorIndex(lines)).toBe(4);
	});
});

describe("findTodayHeaderIndex", () => {
	const friday = new Date(2026, 1, 6);

	it("finds today's header after the separator", () => {
		const lines = ["---", "fm", "---", "##### Fr, 06.02.2026", "- entry"];
		expect(findTodayHeaderIndex(lines, 2, friday)).toBe(3);
	});

	it("returns -1 when header is missing", () => {
		const lines = ["---", "fm", "---", "##### Do, 05.02.2026", "- entry"];
		expect(findTodayHeaderIndex(lines, 2, friday)).toBe(-1);
	});

	it("ignores headers before the afterLine", () => {
		const lines = ["##### Fr, 06.02.2026", "---", "fm", "---"];
		expect(findTodayHeaderIndex(lines, 3, friday)).toBe(-1);
	});

	it("finds header with blank lines between separator and header", () => {
		const lines = ["---", "fm", "---", "", "##### Fr, 06.02.2026"];
		expect(findTodayHeaderIndex(lines, 2, friday)).toBe(4);
	});
});

describe("ensureTodayHeader", () => {
	const friday = new Date(2026, 1, 6);

	it("inserts header after second separator when missing", () => {
		const content = "---\nkey: value\n---\n[[pinned]]\n\n---\n##### Do, 05.02.2026\n- old entry";
		const result = ensureTodayHeader(content, friday);
		const lines = result.newContent.split("\n");
		expect(lines[result.headerLineIndex]).toBe("##### Fr, 06.02.2026");
		// Header should be right after the third --- (which is the second separator when counting from frontmatter)
		// Actually the second separator is at index 2, so header is inserted at index 3
		// Wait — this content has 3 separators. The second is at index 2.
		// Let me verify:
		expect(result.headerLineIndex).toBe(3);
	});

	it("is idempotent when header already exists", () => {
		const content = "---\nfm\n---\n##### Fr, 06.02.2026\n- entry";
		const result = ensureTodayHeader(content, friday);
		expect(result.newContent).toBe(content);
		expect(result.headerLineIndex).toBe(3);
	});

	it("appends separator + header when no second separator found", () => {
		const content = "some content without frontmatter";
		const result = ensureTodayHeader(content, friday);
		expect(result.newContent).toContain("---\n##### Fr, 06.02.2026");
	});

	it("handles content with frontmatter and pinned links", () => {
		const content = "---\ntitle: Work\n---\n[[link1]]\n[[link2]]\n\n---\n##### Do, 05.02.2026\n- old";
		const result = ensureTodayHeader(content, friday);
		const lines = result.newContent.split("\n");
		// Second separator is at index 2 (the frontmatter closing ---)
		// Header should be inserted right after it
		expect(lines[result.headerLineIndex]).toBe("##### Fr, 06.02.2026");
		// Old entries should still be there
		expect(result.newContent).toContain("##### Do, 05.02.2026");
	});

	it("handles empty content", () => {
		const result = ensureTodayHeader("", friday);
		expect(result.newContent).toContain("##### Fr, 06.02.2026");
		expect(result.newContent).toContain("---");
	});
});

describe("addEntryUnderToday", () => {
	const friday = new Date(2026, 1, 6);

	it("adds first entry under today's header", () => {
		const content = "---\nfm\n---\n##### Fr, 06.02.2026";
		const result = addEntryUnderToday(content, "- [[Note]]", friday);
		const lines = result.newContent.split("\n");
		expect(lines[result.entryLineIndex]).toBe("- [[Note]]");
		expect(result.entryLineIndex).toBe(4);
	});

	it("appends after existing entries", () => {
		const content = "---\nfm\n---\n##### Fr, 06.02.2026\n- [[First]]";
		const result = addEntryUnderToday(content, "- [[Second]]", friday);
		const lines = result.newContent.split("\n");
		expect(lines[result.entryLineIndex]).toBe("- [[Second]]");
		expect(result.entryLineIndex).toBe(5);
	});

	it("creates header if missing then adds entry", () => {
		const content = "---\nfm\n---\n##### Do, 05.02.2026\n- old";
		const result = addEntryUnderToday(content, "- [[New]]", friday);
		expect(result.newContent).toContain("##### Fr, 06.02.2026");
		const lines = result.newContent.split("\n");
		expect(lines[result.entryLineIndex]).toBe("- [[New]]");
	});

	it("does not mix entries between days", () => {
		const content = "---\nfm\n---\n##### Fr, 06.02.2026\n- [[Today]]\n\n##### Do, 05.02.2026\n- [[Yesterday]]";
		const result = addEntryUnderToday(content, "- [[New]]", friday);
		const lines = result.newContent.split("\n");
		// New entry should be after [[Today]] but before the blank line
		expect(lines[result.entryLineIndex]).toBe("- [[New]]");
		expect(result.entryLineIndex).toBe(5);
	});
});

describe("formatDiaryEntry", () => {
	it("formats with note and heading and description", () => {
		expect(formatDiaryEntry("My Note", "Section", "did stuff")).toBe(
			"- [[My Note#Section]] - did stuff"
		);
	});

	it("formats with note and heading, no description", () => {
		expect(formatDiaryEntry("My Note", "Section", null)).toBe(
			"- [[My Note#Section]]"
		);
	});

	it("formats with note only, no heading, no description", () => {
		expect(formatDiaryEntry("My Note", null, null)).toBe("- [[My Note]]");
	});

	it("formats with note and description, no heading", () => {
		expect(formatDiaryEntry("My Note", null, "reviewed")).toBe(
			"- [[My Note]] - reviewed"
		);
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
