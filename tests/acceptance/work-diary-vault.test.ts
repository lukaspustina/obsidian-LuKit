import { describe, it, expect } from "vitest";
import { createMockVault, createMockTFile } from "../helpers/obsidian-mocks";
import {
	ensureTodayHeader,
	addEntryUnderToday,
	formatDiaryEntry,
	formatTextEntry,
	formatReminderEntry,
	addReminder,
} from "../../src/features/work-diary/work-diary-engine";

const friday = new Date(2026, 1, 6);

describe("Work diary vault.process() integration", () => {
	it("ensure-today-header via process() inserts header atomically", async () => {
		const initial = "---\nfm\n---\n[[pinned]]\n---\n##### Do, 05.02.2026\n- old";
		const file = createMockTFile("diary.md");
		const vault = createMockVault({ "diary.md": initial });

		let headerLineIndex = 0;
		await vault.process(file, (content) => {
			const result = ensureTodayHeader(content, friday);
			headerLineIndex = result.headerLineIndex;
			return result.newContent;
		});

		const result = vault.files.get("diary.md")!;
		expect(result).toContain("##### Fr, 06.02.2026");
		expect(result).toContain("##### Do, 05.02.2026");
		const lines = result.split("\n");
		expect(lines[headerLineIndex]).toBe("##### Fr, 06.02.2026");
	});

	it("add-diary-entry via process() adds linked entry", async () => {
		const initial = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026";
		const file = createMockTFile("diary.md");
		const vault = createMockVault({ "diary.md": initial });

		const entry = formatDiaryEntry("ProjectX", "Tasks");
		await vault.process(file, (content) => {
			const { newContent } = addEntryUnderToday(content, entry, friday);
			return newContent;
		});

		const result = vault.files.get("diary.md")!;
		expect(result).toContain("- [[ProjectX#Tasks|ProjectX: Tasks]]");
	});

	it("add-text-entry via process() adds text entry", async () => {
		const initial = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026";
		const file = createMockTFile("diary.md");
		const vault = createMockVault({ "diary.md": initial });

		const entry = formatTextEntry("reviewed the budget");
		await vault.process(file, (content) => {
			const { newContent } = addEntryUnderToday(content, entry, friday);
			return newContent;
		});

		const result = vault.files.get("diary.md")!;
		expect(result).toContain("- reviewed the budget");
	});

	it("process() sees latest content even if modified between read/write", async () => {
		const initial = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026\n- entry1";
		const file = createMockTFile("diary.md");
		const vault = createMockVault({ "diary.md": initial });

		// Simulate another plugin modifying the file
		vault.files.set("diary.md", initial + "\n- entry-from-sync");

		const entry = formatTextEntry("my entry");
		await vault.process(file, (content) => {
			// process() should see the latest content including "entry-from-sync"
			expect(content).toContain("- entry-from-sync");
			const { newContent } = addEntryUnderToday(content, entry, friday);
			return newContent;
		});

		const result = vault.files.get("diary.md")!;
		expect(result).toContain("- entry-from-sync");
		expect(result).toContain("- my entry");
	});

	it("fallback flag is captured correctly via process()", async () => {
		const initial = "---\nfm\n---\nno third separator";
		const file = createMockTFile("diary.md");
		const vault = createMockVault({ "diary.md": initial });

		let fallback = false;
		await vault.process(file, (content) => {
			const result = ensureTodayHeader(content, friday);
			fallback = result.fallback;
			return result.newContent;
		});

		expect(fallback).toBe(true);
		const result = vault.files.get("diary.md")!;
		expect(result).toContain("##### Fr, 06.02.2026");
	});

	it("add-reminder via process() creates section and adds entry", async () => {
		const initial = "---\nfm\n---\n[[pinned]]\n\n---\n##### Fr, 06.02.2026";
		const file = createMockTFile("diary.md");
		const vault = createMockVault({ "diary.md": initial });

		const entry = formatReminderEntry("Call dentist", friday);
		await vault.process(file, (content) => {
			const result = addReminder(content, entry);
			if (!result) return content;
			return result.newContent;
		});

		const result = vault.files.get("diary.md")!;
		expect(result).toContain("# Erinnerungen");
		expect(result).toContain("- Call dentist, 06.02.2026");
		expect(result).toContain("##### Fr, 06.02.2026");
	});

	it("add-reminder via process() inserts newest first", async () => {
		const initial = "---\nfm\n---\n[[pinned]]\n\n# Erinnerungen\n- Old, 05.02.2026\n\n---\n##### Fr, 06.02.2026";
		const file = createMockTFile("diary.md");
		const vault = createMockVault({ "diary.md": initial });

		const entry = formatReminderEntry("New thought", friday);
		await vault.process(file, (content) => {
			const result = addReminder(content, entry);
			if (!result) return content;
			return result.newContent;
		});

		const result = vault.files.get("diary.md")!;
		const lines = result.split("\n");
		const headingIdx = lines.indexOf("# Erinnerungen");
		expect(lines[headingIdx + 1]).toBe("- New thought, 06.02.2026");
		expect(lines[headingIdx + 2]).toBe("- Old, 05.02.2026");
	});

	it("process() throws for non-existent file", async () => {
		const file = createMockTFile("missing.md");
		const vault = createMockVault({});

		await expect(
			vault.process(file, (content) => content),
		).rejects.toThrow("File not found");
	});
});
