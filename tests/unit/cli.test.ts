import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	mkdtempSync,
	writeFileSync,
	readFileSync,
	rmSync,
	existsSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import {
	formatTextEntry,
	formatDiaryEntry,
	addEntryUnderToday,
	ensureTodayHeader,
	formatReminderEntry,
	addReminder,
} from "../../src/features/work-diary/work-diary-engine";

const friday = new Date(2026, 1, 6);

describe("CLI: add-text-to-diary", () => {
	let tmpDir: string;
	let diaryPath: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "lukit-cli-"));
		diaryPath = join(tmpDir, "diary.md");
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true });
	});

	it("adds a text entry to a diary file", () => {
		const initial = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatTextEntry("reviewed the budget");
		const { newContent } = addEntryUnderToday(content, entry, "de", friday);
		writeFileSync(diaryPath, newContent, "utf-8");

		const result = readFileSync(diaryPath, "utf-8");
		expect(result).toContain("- reviewed the budget");
	});

	it("creates header if missing then adds text", () => {
		const initial = "---\nfm\n---\n[[pinned]]\n---\n##### Do, 05.02.2026\n- old";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatTextEntry("new task");
		const { newContent } = addEntryUnderToday(content, entry, "de", friday);
		writeFileSync(diaryPath, newContent, "utf-8");

		const result = readFileSync(diaryPath, "utf-8");
		expect(result).toContain("##### Fr, 06.02.2026");
		expect(result).toContain("- new task");
	});
});

describe("CLI: ensure-today-header", () => {
	let tmpDir: string;
	let diaryPath: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "lukit-cli-"));
		diaryPath = join(tmpDir, "diary.md");
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true });
	});

	it("ensures today's header is present", () => {
		const initial = "---\nfm\n---\n[[pinned]]\n---\n##### Do, 05.02.2026\n- old";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const { newContent } = ensureTodayHeader(content, "de", friday);
		writeFileSync(diaryPath, newContent, "utf-8");

		const result = readFileSync(diaryPath, "utf-8");
		expect(result).toContain("##### Fr, 06.02.2026");
		expect(result).toContain("##### Do, 05.02.2026");
	});

	it("is idempotent — running twice does not duplicate header", () => {
		const initial = "---\nfm\n---\n[[pinned]]\n---\n##### Do, 05.02.2026\n- old";
		writeFileSync(diaryPath, initial, "utf-8");

		const content1 = readFileSync(diaryPath, "utf-8");
		const { newContent: pass1 } = ensureTodayHeader(content1, "de", friday);
		writeFileSync(diaryPath, pass1, "utf-8");

		const content2 = readFileSync(diaryPath, "utf-8");
		const { newContent: pass2 } = ensureTodayHeader(content2, "de", friday);
		writeFileSync(diaryPath, pass2, "utf-8");

		const result = readFileSync(diaryPath, "utf-8");
		const headerCount = result.split("##### Fr, 06.02.2026").length - 1;
		expect(headerCount).toBe(1);
	});

	it("warns on fallback when third separator is missing", () => {
		const initial = "---\nfm\n---\nsome content";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const { newContent, fallback } = ensureTodayHeader(content, "de", friday);
		writeFileSync(diaryPath, newContent, "utf-8");

		expect(fallback).toBe(true);
		const result = readFileSync(diaryPath, "utf-8");
		expect(result).toContain("##### Fr, 06.02.2026");
	});
});

describe("CLI: add-diary-entry", () => {
	let tmpDir: string;
	let diaryPath: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "lukit-cli-"));
		diaryPath = join(tmpDir, "diary.md");
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true });
	});

	it("adds a linked entry with heading", () => {
		const initial = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatDiaryEntry("ProjectX", "Tasks");
		const { newContent } = addEntryUnderToday(content, entry, "de", friday);
		writeFileSync(diaryPath, newContent, "utf-8");

		const result = readFileSync(diaryPath, "utf-8");
		expect(result).toContain("- [[ProjectX#Tasks|ProjectX: Tasks]]");
	});

	it("adds a linked entry without heading", () => {
		const initial = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatDiaryEntry("MeetingNotes", null);
		const { newContent } = addEntryUnderToday(content, entry, "de", friday);
		writeFileSync(diaryPath, newContent, "utf-8");

		const result = readFileSync(diaryPath, "utf-8");
		expect(result).toContain("- [[MeetingNotes]]");
	});
});

describe("CLI: add-reminder", () => {
	let tmpDir: string;
	let diaryPath: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "lukit-cli-"));
		diaryPath = join(tmpDir, "diary.md");
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true });
	});

	it("adds a reminder to a diary file", () => {
		const initial = "---\nfm\n---\n[[pinned]]\n\n---\n##### Fr, 06.02.2026";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatReminderEntry("Call dentist", "de", friday);
		const result = addReminder(content, entry);
		expect(result).not.toBeNull();
		writeFileSync(diaryPath, result!.newContent, "utf-8");

		const written = readFileSync(diaryPath, "utf-8");
		expect(written).toContain("# Erinnerungen");
		expect(written).toContain("- Call dentist, 06.02.2026");
		expect(written).toContain("##### Fr, 06.02.2026");
	});

	it("adds newest reminder at top of existing section", () => {
		const initial = "---\nfm\n---\n[[pinned]]\n\n# Erinnerungen\n- Old, 05.02.2026\n\n---\n##### Fr, 06.02.2026";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatReminderEntry("New thought", "de", friday);
		const result = addReminder(content, entry);
		expect(result).not.toBeNull();
		writeFileSync(diaryPath, result!.newContent, "utf-8");

		const written = readFileSync(diaryPath, "utf-8");
		const lines = written.split("\n");
		const headingIdx = lines.indexOf("# Erinnerungen");
		expect(lines[headingIdx + 1]).toBe("- New thought, 06.02.2026");
		expect(lines[headingIdx + 2]).toBe("- Old, 05.02.2026");
	});

	it("returns null when third separator is missing", () => {
		const initial = "---\nfm\n---\nno third separator";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatReminderEntry("reminder", "de", friday);
		const result = addReminder(content, entry);
		expect(result).toBeNull();
	});
});

describe("CLI: init-config", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "lukit-cli-"));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true });
	});

	function runCli(args: string[], home: string): string {
		return execFileSync("npx", ["tsx", "src/cli.ts", ...args], {
			cwd: process.cwd(),
			env: { ...process.env, HOME: home },
			encoding: "utf-8",
		});
	}

	it("creates config file with expected keys", () => {
		const output = runCli(["init-config"], tmpDir);
		const configPath = join(tmpDir, ".lukit.json");

		expect(existsSync(configPath)).toBe(true);
		const config = JSON.parse(readFileSync(configPath, "utf-8"));
		expect(config).toHaveProperty("diaryPath");
		expect(config).toHaveProperty("dateLocale");
		expect(config).toHaveProperty("cliPath");
		expect(config).toHaveProperty("nodePath");
		expect(config.dateLocale).toBe("de");
		expect(output).toContain("Created");
	});

	it("refuses to overwrite existing config", () => {
		const configPath = join(tmpDir, ".lukit.json");
		writeFileSync(configPath, "{}", "utf-8");

		expect(() => runCli(["init-config"], tmpDir)).toThrow();
		const content = readFileSync(configPath, "utf-8");
		expect(content).toBe("{}");
	});
});
